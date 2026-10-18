import {describe,it,expect} from 'vitest';
import {advanceConversation,initialConversation,serializeConversation,deserializeConversation} from '../../../lib/dealtwin/mcp/conversation-state';
import type {DealTwinToolResult} from '../../../lib/dealtwin/mcp/tool-handlers';
import {createDealTwinToolHandler,type ToolServices} from '../../../lib/dealtwin/mcp/tool-handlers';
import {createPostgresWorkflowRuntime} from '../../../lib/server/dealtwin/workflow-runtime';
import {createPostgresJudgeRuntime} from '../../../lib/server/dealtwin/runtime';
import {createMcpConfirmation,verifyMcpConfirmation} from '../../../lib/server/auth/mcp-confirmation';
import {workspace,evidence,JUDGE_TENANT_ID} from '../api/workflow-harness';
import type {CanonicalJsonValue} from '../../../lib/dealtwin/domain/canonical-json';
const result=(references:DealTwinToolResult['references'],httpStatus=200,data:DealTwinToolResult['data']={ok:true}):DealTwinToolResult=>({tool:'compile_deal',httpStatus,data,references});
describe('identifier-only multi-turn state',()=>{
 it('retains real IDs/revision across serialized new instances without financial authority',()=>{
  const state=advanceConversation(initialConversation,result({dealId:'actual-deal',dealVersionId:'actual-v2',proofId:'actual-proof',revision:7},200,{minimumRupiah:'5200000'}));
  expect(state).toMatchObject({dealId:'actual-deal',dealVersionId:'actual-v2',proofId:'actual-proof',revision:7});
  expect(deserializeConversation(serializeConversation(state))).toEqual(state);expect(serializeConversation(state)).not.toContain('5200000');
 });
 it('changes only pending intent when preparing, never inventing successful IDs',()=>{
  const state=advanceConversation(initialConversation,{...result({}),httpStatus:200,prepared:true,tool:'commit_deal'});expect(state.pendingIntent).toBe('prepared');expect(state.preparedTool).toBe('commit_deal');expect(state.salesOrderId).toBeUndefined();
 });
 it('preserves last known identifiers but demands refresh after revision/stale failure',()=>{
  const state=advanceConversation(initialConversation,result({dealId:'a',dealVersionId:'v1',proofId:'proof-a',revision:3}));
  expect(advanceConversation(state,result({},409,{error:{code:'REVISION_CONFLICT'}}))).toMatchObject({...state,pendingIntent:'refresh'});
 });
 it('does not carry a proof/commitment from Deal A into a new Deal/version',()=>{
  const state=advanceConversation(initialConversation,result({dealId:'a',dealVersionId:'a-v1',proofId:'a-proof',commitmentId:'a-cap'}));
  const other=advanceConversation(state,result({dealId:'b',dealVersionId:'b-v1'}));expect(other.dealId).toBe('b');expect(other.proofId).toBeUndefined();expect(other.commitmentId).toBeUndefined();
 });
 it('rejects persisted balance/role authority, oversized state and malformed IDs',()=>{
  for(const extra of [{confirmedBalanceRupiah:'999'},{role:'admin'},{proofId:'../other'}])expect(()=>deserializeConversation(JSON.stringify({...initialConversation,...extra}))).toThrow();
  expect(()=>deserializeConversation('x'.repeat(5000))).toThrow();
 });
 it('does not rewind newer state when a successful historical receipt is replayed',()=>{
  const state=advanceConversation(initialConversation,result({dealId:'a',dealVersionId:'a-v2',proofId:'a-proof',revision:9}));
  expect(advanceConversation(state,result({dealId:'a',dealVersionId:'a-v1',proofId:'old-proof',revision:3}))).toMatchObject({...state,pendingIntent:'refresh'});
 });
 it('requires refresh when successful selected-proof read reports current STALE',()=>{
  const state=advanceConversation(initialConversation,result({dealId:'a',dealVersionId:'v2',proofId:'p2',revision:4},200,{proof:{id:'p2',currentStatus:'STALE'}}));
  expect(state).toMatchObject({proofId:'p2',pendingIntent:'refresh'});
 });
 it.each(['get_deal','list_deals','inspect_timeline'] as const)('does not let %s hide a selected stale-proof warning',tool=>{
  const state=advanceConversation(initialConversation,result({dealId:'a',dealVersionId:'v2',proofId:'p2',revision:4},200,{proof:{id:'p2',currentStatus:'STALE'}}));
  const read={...result(tool==='get_deal'?{dealId:'a',dealVersionId:'v2',revision:5}:{revision:5},200,tool==='get_deal'?{proofs:[{id:'p2',currentStatus:'STALE'}]}:{ok:true}),tool};
  expect(advanceConversation(state,read)).toMatchObject({proofId:'p2',pendingIntent:'refresh'});
 });
 it.each(['replay_proof','stress_deal'] as const)('never mixes old aggregate identity with unknown owner from %s',tool=>{
  const state=advanceConversation(initialConversation,result({dealId:'a',dealVersionId:'a-v2',proofId:'a-proof',commitmentId:'a-cap',salesOrderId:'a-so',revision:4}));
  const switched=advanceConversation(state,{...result({proofId:'b-proof',revision:5}),tool});
  expect(switched).toMatchObject({proofId:'b-proof',pendingIntent:'refresh'});
  for(const field of ['dealId','dealVersionId','commitmentId','salesOrderId'] as const)expect(switched[field]).toBeUndefined();
 });
 it('drops old commitment when verified owner tuple selects another proof of the same version',()=>{
  const state=advanceConversation(initialConversation,result({dealId:'a',dealVersionId:'v2',proofId:'p1',commitmentId:'cap-p1'}));
  const switched=advanceConversation(state,result({dealId:'a',dealVersionId:'v2',proofId:'p2'},200,{proof:{id:'p2',currentStatus:'VALID'}}));
  expect(switched.proofId).toBe('p2');expect(switched.commitmentId).toBeUndefined();expect(switched.pendingIntent).toBe('none');
 });
});
const key='task26-persisted-multi-turn-confirmation-key-more-than32bytes';
const clock=new Date('2026-09-16T12:00:00.000Z');
const actor={tenantId:JUDGE_TENANT_ID,actorId:'multi-turn-human',role:'admin' as const};
const obj=(value:CanonicalJsonValue)=>value as Record<string,CanonicalJsonValue>;
describe('actual durable service conversation across executor instances',()=>{
 const db=workspace();
 const fresh=()=>{
  const judge=createPostgresJudgeRuntime(db().appPool,db().resetPool);
  const services:ToolServices={workflow:createPostgresWorkflowRuntime(db().appPool),reserveLiquidity:judge.reserveLiquidity,commitDeal:judge.commitDeal,releaseCommitment:judge.releaseCommitment,
   readTimeline:async ctx=>{const s=await judge.loadJudgeState(ctx);return {httpStatus:200,body:{revision:s.revision,timeline:s.timeline}};}};
  return createDealTwinToolHandler(services,{now:()=>clock,verifyConfirmation:(ctx,request,now)=>verifyMcpConfirmation(ctx,request,{key,now})});
 };
 const run=async(tool:string,input:Record<string,unknown>)=>{
  const value={tool,arguments:{mode:'execute',input}};
  const signed={...value,arguments:{...value.arguments,confirmationToken:createMcpConfirmation(actor,value,{key,now:clock})}};
  return fresh()(actor,signed);
 };
 it('carries persisted A/version/proof, retained constraints and stale ERP evidence without storing balances',async()=>{
  const compiled=await run('compile_deal',{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',expectedRevision:1,idempotencyKey:'turn-compile'});expect(compiled.httpStatus).toBe(200);
  const amended=await run('recompile_deal',{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',expectedRevision:2,idempotencyKey:'turn-recompile'});expect(amended.httpStatus).toBe(200);expect(amended.data).toMatchObject({minimumProjectedBalanceRupiah:'5000000'});
  let state=advanceConversation(advanceConversation(initialConversation,compiled),amended);expect(state.proofId).toBeTruthy();
  const stored=serializeConversation(state);state=deserializeConversation(stored);
  const graph=await fresh()(actor,{tool:'get_deal',arguments:{dealId:state.dealId}});expect(graph.httpStatus).toBe(200);expect(graph.references.dealVersionId).toBe(state.dealVersionId);expect(obj(graph.data).constraints).toHaveLength(5);
  expect((obj(obj(graph.data).currentVersion!).terms as {customerPaymentEvents:{basisPoints:number}[]}).customerPaymentEvents[0]?.basisPoints).toBe(2500);
  const changed=await run('mutate_judge_obligation',{invoiceId:'judge-existing-ap',amountRupiah:'19000000',expectedRevision:3,idempotencyKey:'turn-ap19'});expect(changed.httpStatus).toBe(200);
  const proof=await fresh()(actor,{tool:'get_proof',arguments:{dealId:state.dealId,proofId:state.proofId}});expect(proof.httpStatus).toBe(200);expect(obj(proof.data).proof).toMatchObject({id:state.proofId,currentStatus:'STALE'});
  state=advanceConversation(state,proof);expect(state.pendingIntent).toBe('refresh');expect(serializeConversation(state)).not.toMatch(/5000000|19000000|basisPoints/);
  const reread=await fresh()(actor,{tool:'get_deal',arguments:{dealId:state.dealId}});state=advanceConversation(state,reread);expect(state.pendingIntent).toBe('refresh');
  const timeline=await fresh()(actor,{tool:'inspect_timeline',arguments:{}});state=advanceConversation(state,timeline);expect(state.pendingIntent).toBe('refresh');
  const staleCommit=await run('commit_deal',{dealId:state.dealId,dealVersionId:state.dealVersionId,proofId:state.proofId,canonicalEventHash:(obj(amended.data).proof as {canonicalEventHash:string}).canonicalEventHash,expectedRevision:4,idempotencyKey:'turn-stale-commit'});
  expect(staleCommit.httpStatus).toBe(409);expect(staleCommit.data).toMatchObject({error:{code:'PROOF_STALE'}});
 });
 it('prepare-only commit is harmless; reserve/release retry keeps original receipt and refreshes newer conversation',async()=>{
  const amended=await run('recompile_deal',{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',expectedRevision:1,idempotencyKey:'capacity-amend'});expect(amended.httpStatus).toBe(200);
  const proof=obj(obj(amended.data).proof!);const identity={dealId:'judge-deal-a',dealVersionId:proof.dealVersionId,proofId:proof.id,canonicalEventHash:proof.canonicalEventHash};
  const before=await evidence(db());expect(await fresh()(actor,{tool:'commit_deal',arguments:{mode:'prepare',input:{...identity,expectedRevision:2,idempotencyKey:'do-not-send'}}})).toMatchObject({prepared:true});expect(await evidence(db())).toEqual(before);
  const reserved=await run('reserve_liquidity',{...identity,expectedRevision:2,idempotencyKey:'capacity-reserve'});expect(reserved.httpStatus).toBe(200);expect(reserved.references.revision).toBe(3);
  const commitmentId=reserved.references.commitmentId!;const {dealId:_,...owner}=identity;void _;
  const released=await run('release_commitment',{...owner,commitmentId,expectedRevision:3,idempotencyKey:'capacity-release'});expect(released.httpStatus).toBe(200);expect(released.data).toMatchObject({status:'released',revision:4});
  const after=await evidence(db());const retry=await run('reserve_liquidity',{...identity,expectedRevision:2,idempotencyKey:'capacity-reserve'});expect(retry).toEqual(reserved);expect(await evidence(db())).toEqual(after);
  const state=advanceConversation(advanceConversation(initialConversation,released),retry);expect(state).toMatchObject({revision:4,pendingIntent:'refresh'});
 });
 it('cross-deal historical replay retains B proof without attaching A identity',async()=>{
  const b=await run('generate_proof',{dealId:'judge-deal-b',dealVersionId:'judge-version-b-1',expectedRevision:1,idempotencyKey:'review-b-proof'});expect(b.httpStatus).toBe(200);
  const a=await run('recompile_deal',{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',expectedRevision:2,idempotencyKey:'review-a-amend'});expect(a.httpStatus).toBe(200);
  const replay=await run('replay_proof',{proofId:b.references.proofId,expectedRevision:3,idempotencyKey:'review-replay-b'});expect(replay.httpStatus).toBe(200);
  const state=advanceConversation(advanceConversation(initialConversation,a),replay);expect(state).toMatchObject({proofId:b.references.proofId,pendingIntent:'refresh'});expect(state.dealId).toBeUndefined();expect(state.dealVersionId).toBeUndefined();
 });
});
