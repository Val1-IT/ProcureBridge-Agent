import {describe,expect,it,vi} from 'vitest';
import {POST as mcp} from '../../../app/api/dealtwin/mcp/route';
import {POST as approve} from '../../../app/api/dealtwin/approvals/[approvalId]/decision/route';
import {createMcpConfirmation} from '../../../lib/server/auth/mcp-confirmation';
import {advanceConversation,deserializeConversation,initialConversation,serializeConversation} from '../../../lib/dealtwin/mcp/conversation-state';
import type {DealTwinToolResult} from '../../../lib/dealtwin/mcp/tool-handlers';
import type {DealProofDto} from '../../../lib/dealtwin/proof/proof-dto';
import {workspace,request,evidence,JUDGE_TENANT_ID} from '../api/workflow-harness';

let db:ReturnType<typeof workspace>;
vi.mock('../../../lib/server/dealtwin/workflow-runtime',async()=>{
 const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/workflow-runtime')>('../../../lib/server/dealtwin/workflow-runtime');
 return {...actual,getWorkflowRuntime:()=>actual.createPostgresWorkflowRuntime(db().appPool)};
});
vi.mock('../../../lib/server/dealtwin/runtime',async()=>{
 const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/runtime')>('../../../lib/server/dealtwin/runtime');
 return {...actual,getJudgeRuntime:()=>actual.createPostgresJudgeRuntime(db().appPool,db().resetPool)};
});
const actor={tenantId:JUDGE_TENANT_ID,actorId:'task22-admin',role:'admin' as const};
function rpc(name:string,args:unknown){
 const base=request('mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
 const headers=new Headers(base.headers);headers.set('accept','application/json, text/event-stream');headers.set('mcp-protocol-version','2025-11-25');
 return new Request(base,{headers});
}
async function invoke(name:string,args:unknown):Promise<DealTwinToolResult>{
 const response=await mcp(rpc(name,args));expect(response.status).toBe(200);
 const envelope=await response.json() as {result:{structuredContent:DealTwinToolResult;content:{text:string}[];isError:boolean}};
 const result=envelope.result;
 expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
 expect(result.isError).toBe(result.structuredContent.httpStatus>=400);
 return result.structuredContent;
}
function signed(tool:string,input:Record<string,unknown>){
 const value={tool,arguments:{mode:'execute',input}};
 // Test fixture consent only: no Alexa/human approval capture is claimed.
 return {...value.arguments,confirmationToken:createMcpConfirmation(actor,value,{key:process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY!,now:new Date()})};
}
function proof(result:DealTwinToolResult):DealProofDto{return (result.data as unknown as {proof:DealProofDto}).proof;}
function identity(value:DealProofDto){return {dealId:value.dealId,dealVersionId:value.dealVersionId,proofId:value.id,canonicalEventHash:value.canonicalEventHash};}

describe('simulated conversation / real MCP handlers and PostgreSQL, no Alexa or live provider',()=>{
 db=workspace();
 it('carries the canonical failure, amendment, approval, commit, collision, stale proof and remediation across turns',async()=>{
  let revision=1;let conversation=initialConversation;
  const mutate=async(name:string,fields:Record<string,unknown>,key:string,status=200)=>{
   const args=signed(name,{...fields,expectedRevision:revision,idempotencyKey:key});
   const result=await invoke(name,args);expect(result.httpStatus).toBe(status);
   if(result.references.revision!==undefined)revision=result.references.revision;
   conversation=deserializeConversation(serializeConversation(advanceConversation(conversation,result)));
   return {result,args};
  };
  const initial=await evidence(db());
  const b=proof((await mutate('generate_proof',{dealId:'judge-deal-b',dealVersionId:'judge-version-b-1'},'conversation-b-proof')).result);
  const failed=await mutate('compile_deal',{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1'},'conversation-initial');
  expect(failed.result.data).toMatchObject({outcome:'DOES_NOT_COMPILE',shortfallRupiah:'3000000',firstViolationDate:'2026-09-22'});
  const amended=await mutate('recompile_deal',{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1'},'conversation-amend');
  expect(amended.result.data).toMatchObject({outcome:'PROPOSED_AMENDMENT',minimumProjectedBalanceRupiah:'5000000',proof:{terms:{customerPaymentEvents:expect.arrayContaining([expect.objectContaining({basisPoints:2500})])}}});
  const a=proof(amended.result);
  const stress=await mutate('stress_deal',{proofId:a.id,scenarios:[{schemaVersion:'dealtwin.stress-scenario.v1',id:'delay-three',type:'customer_receipt_delay',days:3}]},'conversation-stress');
  expect(stress.result.data).toMatchObject({scope:'historical_proof'});
  const current=await invoke('get_deal',{dealId:a.dealId});expect(current.httpStatus).toBe(200);
  expect(current.data).toMatchObject({currentVersion:{id:a.dealVersionId,terms:{customerPaymentEvents:expect.arrayContaining([expect.objectContaining({basisPoints:2500})])}}});
  conversation=advanceConversation(conversation,current);
  const beforePrepare=await evidence(db());
  const prepared=await invoke('commit_deal',{mode:'prepare',input:{...identity(a),expectedRevision:revision,idempotencyKey:'conversation-prepare'}});
  expect(prepared.prepared).toBe(true);expect(await evidence(db())).toEqual(beforePrepare);
  await mutate('reserve_liquidity',identity(a),'conversation-reserve');
  const beforeBlocked=await evidence(db());
  expect((await mutate('commit_deal',identity(a),'conversation-no-approval',409)).result.data).toMatchObject({error:{code:'APPROVAL_REQUIRED'}});
  expect(await evidence(db())).toEqual(beforeBlocked);
  const approvals=a.approvals as unknown as {id:string}[];expect(approvals).toHaveLength(1);
  const approvalId=approvals[0]!.id;
  const decision={proofId:a.id,dealVersionId:a.dealVersionId,decision:'approved',comment:'Synthetic test approver reviews fixed proof',expectedRevision:revision,idempotencyKey:'conversation-approval'};
  const context={params:Promise.resolve({approvalId})};
  expect((await approve(request('approvals/'+approvalId+'/decision',decision,'admin'),context)).status).toBe(403);
  expect(await evidence(db())).toEqual(beforeBlocked);
  const authorized=await approve(request('approvals/'+approvalId+'/decision',decision,'approver'),context);expect(authorized.status).toBe(200);
  expect(await authorized.json()).toMatchObject({status:'approved',proofUnchanged:true});
  // Approval receipts intentionally omit a revision: reload authoritative state.
  const refreshed=await invoke('get_deal',{dealId:a.dealId});
  expect(refreshed.references.revision).toBe(revision+1);revision=refreshed.references.revision!;
  const committed=await mutate('commit_deal',identity(a),'conversation-commit');
  expect(committed.result.data).toMatchObject({status:'committed'});
  const afterCommit=await evidence(db());
  expect((afterCommit.erp_sales_orders as unknown[]).length).toBe((initial.erp_sales_orders as unknown[]).length+1);
  expect(afterCommit.erp_cash_movements).toEqual(initial.erp_cash_movements);
  expect(await invoke('commit_deal',committed.args)).toEqual(committed.result);expect(await evidence(db())).toEqual(afterCommit);
  const collision=await mutate('compile_deal',{dealId:b.dealId,dealVersionId:b.dealVersionId},'conversation-b-compile');
  expect(collision.result.data).toMatchObject({outcome:'DOES_NOT_COMPILE',shortfallRupiah:'5000000'});
  const beforeCollision=await evidence(db());
  expect((await mutate('reserve_liquidity',identity(b),'conversation-collision',409)).result.data).toMatchObject({error:{code:'LIQUIDITY_COLLISION'}});
  const afterCollision=await evidence(db());
  // A rejected collision records evidence, but allocates nothing and advances no revision.
  for(const table of Object.keys(beforeCollision).filter(name=>!['erp','erp_audit_events'].includes(name))){
   expect(afterCollision[table]).toEqual(beforeCollision[table]);
  }
  const audit=afterCollision.erp_audit_events as {row:{action:string;detail:{operationSucceeded:boolean}}}[];
  expect(audit).toHaveLength((beforeCollision.erp_audit_events as unknown[]).length+1);
  expect(audit.some(({row})=>row.action==='dealtwin.commitment.conflict'&&row.detail.operationSucceeded===false)).toBe(true);
  await mutate('mutate_judge_obligation',{invoiceId:'judge-existing-ap',amountRupiah:'19000000'},'conversation-ap19');
  const stale=await invoke('get_proof',{dealId:a.dealId,proofId:a.id});expect(stale.data).toMatchObject({proof:{currentStatus:'STALE'}});
  conversation=advanceConversation(conversation,stale);expect(conversation.pendingIntent).toBe('refresh');
  const remediation=await mutate('recompile_deal',{dealId:a.dealId,dealVersionId:a.dealVersionId},'conversation-remediate');
  expect(remediation.result.data).toMatchObject({outcome:'REMEDIATION_PENDING',minimumProjectedBalanceRupiah:'5200000',proof:{terms:{customerPaymentEvents:expect.arrayContaining([expect.objectContaining({basisPoints:2700})])}}});
  const replay=await mutate('replay_proof',{proofId:a.id},'conversation-replay');
  expect(replay.result.data).toMatchObject({replayed:true,currentStatus:'STALE',proofId:a.id});
  const final=await evidence(db());
  expect(final.erp_sales_orders).toEqual(afterCommit.erp_sales_orders);
  expect(final.erp_cash_movements).toEqual(initial.erp_cash_movements);
  expect(final.dealtwin_liquidity_commitments).toEqual(afterCommit.dealtwin_liquidity_commitments);
  expect(serializeConversation(conversation)).not.toMatch(/5000000|19000000|basisPoints|confirmationToken/);
 });
 it('keeps prepare offline and refuses disabled live extraction without writes or a fixture fallback',async()=>{
  vi.stubEnv('DEALTWIN_NEBIUS_LIVE_ENABLED','false');
  const fetcher=vi.fn(()=>{throw new Error('NO_PROVIDER_CALL_ALLOWED');});vi.stubGlobal('fetch',fetcher);
  try{
   const before=await evidence(db());
   const input={dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',text:'Deposit minimum 25%.',expectedRevision:1,idempotencyKey:'conversation-provider-disabled'};
   expect((await invoke('extract_constraints',{mode:'prepare',input})).prepared).toBe(true);
   const result=await invoke('extract_constraints',signed('extract_constraints',input));
   expect(result.httpStatus).toBe(503);expect(result.data).toMatchObject({error:{code:'LIVE_PROVIDER_NOT_AUTHORIZED'}});
   expect(fetcher).not.toHaveBeenCalled();expect(await evidence(db())).toEqual(before);
  }finally{vi.unstubAllGlobals();}
 });
});
