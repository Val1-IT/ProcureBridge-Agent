import {describe,it,expect} from 'vitest';
import {createDealTwinToolHandler,type ToolServices} from '../../../lib/dealtwin/mcp/tool-handlers';
import {parseToolRequest,listToolDefinitions,type DealTwinToolRequest} from '../../../lib/dealtwin/mcp/tool-schemas';
import {createMcpConfirmation,verifyMcpConfirmation} from '../../../lib/server/auth/mcp-confirmation';
import {createPostgresWorkflowRuntime} from '../../../lib/server/dealtwin/workflow-runtime';
import {createPostgresJudgeRuntime} from '../../../lib/server/dealtwin/runtime';
import {workspace,context,evidence,JUDGE_TENANT_ID} from '../api/workflow-harness';
const key='task26-synthetic-confirmation-secret-more-than32bytes';
const clock=new Date('2026-09-16T12:00:00.000Z');const actor={tenantId:JUDGE_TENANT_ID,actorId:'mcp-admin',role:'admin' as const};
const command:DealTwinToolRequest={tool:'compile_deal',arguments:{mode:'execute',input:{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',expectedRevision:1,idempotencyKey:'mcp-compile'}}};
function consent(value:unknown=command):DealTwinToolRequest{const parsed=parseToolRequest(value);return parseToolRequest({...parsed,arguments:{...parsed.arguments,confirmationToken:createMcpConfirmation(actor,parsed,{key,now:clock})}});}
describe('service tools / actual PostgreSQL role',()=>{
 const db=workspace();
 const executor=()=>{
  const judge=createPostgresJudgeRuntime(db().appPool,db().resetPool);const services:ToolServices={workflow:createPostgresWorkflowRuntime(db().appPool),reserveLiquidity:judge.reserveLiquidity,commitDeal:judge.commitDeal,releaseCommitment:judge.releaseCommitment,
   readTimeline:async ctx=>{const state=await judge.loadJudgeState(ctx);return {httpStatus:200,body:{revision:state.revision,timeline:state.timeline}};}};
  return createDealTwinToolHandler(services,{now:()=>clock,verifyConfirmation:(ctx,req,now)=>verifyMcpConfirmation(ctx,req,{key,now})});
 };
 it('delegates compile with server clock/identity and original-response idempotency',async()=>{
  const run=executor();const req=consent();const first=await run(actor,req);expect(first.httpStatus).toBe(200);expect(first.data).toMatchObject({outcome:'DOES_NOT_COMPILE',shortfallRupiah:'3000000'});
  expect(first.references).toMatchObject({dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',revision:2});const before=await evidence(db());
  expect(await run(actor,req)).toEqual(first);expect(await evidence(db())).toEqual(before);
  const changed={...command,arguments:{...command.arguments,input:{...(command.arguments.input as object),expectedRevision:2}}};
  expect((await run(actor,consent(changed))).data).toMatchObject({error:{code:'IDEMPOTENCY_KEY_REUSED'}});expect(await evidence(db())).toEqual(before);
 });
 it('prepares without writes, and cannot turn a model boolean into user confirmation',async()=>{
  const before=await evidence(db());const prepare={...command,arguments:{...command.arguments,mode:'prepare'}};
  expect(await executor()(actor,prepare)).toMatchObject({httpStatus:200,prepared:true});
  expect((await executor()(actor,command)).data).toMatchObject({error:{code:'CONFIRMATION_REQUIRED'}});
  expect((await executor()(actor,{...command,arguments:{...command.arguments,confirmed:true}})).httpStatus).toBe(422);
  expect(await evidence(db())).toEqual(before);
 });
 it('denies raw database, body identity, foreign tenant and unsuitable role',async()=>{
  const before=await evidence(db());const run=executor();
  for(const req of [{tool:'execute_sql',arguments:{sql:'delete from erp_workspaces'}},{...command,arguments:{...command.arguments,table:'erp_workspaces'}},{...command,arguments:{...command.arguments,tenantId:'foreign',role:'admin'}}])expect((await run(actor,req)).httpStatus).toBe(422);
  expect((await run({...actor,tenantId:'foreign'},consent())).httpStatus).toBe(403);
  expect((await run({...actor,role:'approver'},consent())).httpStatus).toBe(403);expect(await evidence(db())).toEqual(before);
 });
 it('reports stale revision without changing durable identifiers or constraints',async()=>{
  const run=executor();expect((await run(actor,consent())).httpStatus).toBe(200);const before=await evidence(db());
  const newer={...command,arguments:{...command.arguments,input:{...(command.arguments.input as object),idempotencyKey:'stale-new'}}};
  expect((await run(actor,consent(newer))).data).toMatchObject({error:{code:'REVISION_CONFLICT'}});expect(await evidence(db())).toEqual(before);
 });
 it('read tools return current persisted graph/timeline without receipts or mutations',async()=>{
  const before=await evidence(db());const run=executor();const graph=await run(actor,{tool:'get_deal',arguments:{dealId:'judge-deal-a'}});expect(graph.httpStatus).toBe(200);expect(graph.references.dealVersionId).toBe('judge-version-a-1');
  expect((await run(actor,{tool:'inspect_timeline',arguments:{}})).data).toHaveProperty('timeline');expect(await evidence(db())).toEqual(before);
 });
 it('retains historical receipts after reset with a fresh executor instance',async()=>{
  const req=consent();const first=await executor()(actor,req);expect(first.httpStatus).toBe(200);
  const reset=createPostgresJudgeRuntime(db().appPool,db().resetPool);expect((await reset.resetJudgeTenant(context(2,'mcp-after-reset'))).httpStatus).toBe(200);
  expect(await executor()(actor,req)).toEqual(first);
 });
});
describe('strict tool contract / server consent',()=>{
 it('advertises allowlisted input schemas, no sql/table tool',()=>{
  const tools=listToolDefinitions();expect(tools.map(x=>x.name)).toContain('commit_deal');expect(tools.map(x=>x.name)).not.toContain('execute_sql');
  expect(tools.every(x=>typeof x.inputSchema==='object')).toBe(true);expect(parseToolRequest(command)).toMatchObject(command);
 });
 it('binds short-lived consent to actor, tenant, exact operation payload and revision',()=>{
  const req=consent();expect(verifyMcpConfirmation(actor,req,{key,now:clock})).toBe(true);
  expect(verifyMcpConfirmation({...actor,actorId:'other'},req,{key,now:clock})).toBe(false);
  expect(verifyMcpConfirmation(actor,{...req,tool:'commit_deal'},{key,now:clock})).toBe(false);
  expect(verifyMcpConfirmation(actor,req,{key,now:new Date(clock.getTime()+301000)})).toBe(false);
  expect(verifyMcpConfirmation(actor,{...req,arguments:{...req.arguments,confirmationToken:'forged'}},{key,now:clock})).toBe(false);
 });
 it('has no authority escalation factory in published tools',()=>{
  const names=listToolDefinitions().map(x=>x.name);expect(names).not.toContain('issue_session');expect(names).not.toContain('confirm_tool_execution');expect(names).toContain('release_commitment');
  expect(()=>parseToolRequest({...command,role:'admin'})).toThrow();
 });
});
