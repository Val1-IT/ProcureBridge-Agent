import {describe,it,expect,vi,beforeEach} from 'vitest';
import {POST} from '../../../app/api/dealtwin/deals/[dealId]/constraints/extract/route';
import {POST as confirm} from '../../../app/api/dealtwin/deals/[dealId]/constraints/confirm/route';
import {POST as compile} from '../../../app/api/dealtwin/deals/[dealId]/compile/route';
import {POST as reset} from '../../../app/api/dealtwin/judge/reset/route';
import {GET as detail} from '../../../app/api/dealtwin/deals/[dealId]/route';
import {NemotronConstraintExtractor} from '../../../lib/dealtwin/ai/constraint-extractor';
import {workspace,request,params,mutation,evidence,ids,JUDGE_TENANT_ID,context} from './workflow-harness';
import {withTransaction} from '../../../lib/server/postgres/transaction';
import {createPostgresWorkflowPort} from '../../../lib/server/postgres/postgres-workflow-port';
let db:ReturnType<typeof workspace>;let calls=0;let model:unknown;let hook:(()=>Promise<void>)|undefined;
const good={schemaVersion:'dealtwin.constraint-extraction.v1',candidates:[{kind:'customer_deposit_min_bps',value:2500,sourceText:'Deposit minimum 25%'}],missingFields:[]};
const extractor=new NemotronConstraintExtractor({async complete(){calls++;await hook?.();return {content:JSON.stringify(model),provider:'fixture',model:'synthetic-nemotron'};}});
vi.mock('../../../lib/server/dealtwin/workflow-runtime',async()=>{
 const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/workflow-runtime')>('../../../lib/server/dealtwin/workflow-runtime');
 return {...actual,getWorkflowRuntime:()=>actual.createPostgresWorkflowRuntime(db().appPool,{extractor})};
});
const input=(key='extract')=>({...mutation(1,key),dealVersionId:'judge-version-a-1',text:'Deposit minimum 25%.'});
interface Graph {currentVersion:{id:string;terms:unknown};constraints:{id:string;kind:string;value:unknown;provenance:string;resolution:string;sourceText:string|null}[]}
async function graph():Promise<Graph>{const response=await detail(request('deals/judge-deal-a'),params());expect(response.status).toBe(200);return await response.json() as Graph;}
describe('constraint extraction HTTP / actual PostgreSQL app-role writes',()=>{
 db=workspace();beforeEach(()=>{calls=0;model=good;hook=undefined;});
 it('persists review-only candidates/source and old constraints; only explicit human confirmation permits evaluation',async()=>{
  const old=await graph();const result=await POST(request('deals/judge-deal-a/constraints/extract',input()),params());expect(result.status).toBe(200);
  const body=await result.json() as {revision:number;dealVersionId:string;metadata:{provider:string}};
  expect(body).toMatchObject({revision:2,metadata:{provider:'fixture'}});
  const current=await graph();expect(current.currentVersion.terms).toEqual(old.currentVersion.terms);
  expect(current.constraints.find(row=>row.kind==='customer_deposit_min_bps')).toMatchObject({value:2500,provenance:'ai_extracted',resolution:'pending_confirmation',sourceText:'Deposit minimum 25%'});
  for(const prior of old.constraints)expect(current.constraints.find(row=>row.kind===prior.kind)).toMatchObject({value:prior.value,provenance:prior.provenance,resolution:'confirmed',sourceText:prior.sourceText});
  expect(await graph()).toEqual(current);
  const beforeCompile=await compile(request('deals/judge-deal-a/compile',{...mutation(2,'pending-compile'),dealVersionId:body.dealVersionId}),params());
  expect(beforeCompile.status).toBe(200);expect(await beforeCompile.json()).toMatchObject({outcome:'UNRESOLVED'});
  const approved=await confirm(request('deals/judge-deal-a/constraints/confirm',{...mutation(3,'human-confirm'),dealVersionId:body.dealVersionId,constraintIds:await ids(db(),body.dealVersionId)}),params());expect(approved.status).toBe(200);
  const confirmed=await graph();expect(confirmed.constraints.find(row=>row.kind==='customer_deposit_min_bps')).toMatchObject({provenance:'user_confirmed',resolution:'confirmed',sourceText:'Deposit minimum 25%'});
  const actual=await compile(request('deals/judge-deal-a/compile',{...mutation(4,'actual-compile'),dealVersionId:confirmed.currentVersion.id}),params());
  expect(actual.status).toBe(200);expect(await actual.json()).toMatchObject({outcome:'DOES_NOT_COMPILE'});
  const historical=await createPostgresWorkflowPort(db().appPool).transact({tenantId:JUDGE_TENANT_ID,actorId:'read',role:'admin',expectedRevision:0,idempotencyKey:'read-old',now:new Date().toISOString()},tx=>tx.constraints('judge-version-a-1'));
  expect(historical.constraints).toHaveLength(old.constraints.length);
 });
 it('reads immutable success before revision/version/provider, even after confirmation and reset',async()=>{
  const command=input('original-extraction');const first=await POST(request('deals/judge-deal-a/constraints/extract',command),params());expect(first.status).toBe(200);const original=await first.json();
  expect((await reset(request('judge/reset',mutation(2,'after-extract-reset')))).status).toBe(200);const before=await evidence(db());
  expect(await (await POST(request('deals/judge-deal-a/constraints/extract',command),params())).json()).toEqual(original);expect(calls).toBe(1);
  expect((await POST(request('deals/judge-deal-a/constraints/extract',{...command,text:'Different payload'}),params())).status).toBe(409);expect(await evidence(db())).toEqual(before);
 });
 it('rejects authoritative/model-malformed output, missing information and policy contradictions without writes',async()=>{
  const before=await evidence(db());
  for(const value of [{...good,outcome:'COMPILES'}, {...good,candidates:[],missingFields:['supplier_payment_due_days']},{...good,candidates:[{kind:'customer_deposit_min_bps',value:5000,sourceText:'Deposit minimum 25%'}]}]){
   model=value;const response=await POST(request('deals/judge-deal-a/constraints/extract',input('bad-'+calls)),params());expect(response.status).toBe(422);expect(await evidence(db())).toEqual(before);
  }
 });
 it('does not hold workspace lock during provider and refuses stale write after a concurrent ordinary command',async()=>{
  hook=async()=>{
   await withTransaction(db().appPool,JUDGE_TENANT_ID,tx=>tx.query('select revision from public.erp_workspaces where tenant_id=$1 for update nowait',[JUDGE_TENANT_ID]));
   const concurrent=await compile(request('deals/judge-deal-a/compile',{...mutation(1,'concurrent-compile'),dealVersionId:'judge-version-a-1'}),params());expect(concurrent.status).toBe(200);
  };
  const response=await POST(request('deals/judge-deal-a/constraints/extract',input()),params());expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({error:{code:'REVISION_CONFLICT'}});expect((await graph()).currentVersion.id).toBe('judge-version-a-1');
 });
 it('rejects anonymous/role/body/target/size bypasses before any provider call',async()=>{
  const before=await evidence(db());
  expect((await POST(request('deals/judge-deal-a/constraints/extract',input(),null),params())).status).toBe(401);
  expect((await POST(request('deals/judge-deal-a/constraints/extract',input(),'approver'),params())).status).toBe(403);
  for(const extra of [{tenantId:'foreign'},{role:'admin'},{now:'2026-09-12'},{confirmedBalanceRupiah:'999'}])expect((await POST(request('deals/judge-deal-a/constraints/extract',{...input(),...extra}),params())).status).toBe(422);
  expect((await POST(request('deals/judge-deal-b/constraints/extract',input()),params('judge-deal-b'))).status).toBe(422);
  expect((await POST(request('deals/judge-deal-a/constraints/extract',{...input(),text:'x'.repeat(5000)}),params())).status).toBe(413);
  expect(calls).toBe(0);expect(await evidence(db())).toEqual(before);
 });
 it('rejects invented inventory references without writing a review version',async()=>{
  model={...good,candidates:[{kind:'required_inventory_available',value:{productId:'foreign-product',warehouseId:'foreign-warehouse',quantity:1},sourceText:'Deposit minimum 25%'}]};
  const before=await evidence(db());const response=await POST(request('deals/judge-deal-a/constraints/extract',input()),params());
  expect(response.status).toBe(422);expect(await response.json()).toMatchObject({error:{code:'AI_REFERENCE_INVALID'}});expect(await evidence(db())).toEqual(before);
 });
 it('rolls back candidate/version/revision/receipt on an unexpected constraint write failure',async()=>{
  await db().ownerPool.query("create function fail_ai_constraint() returns trigger language plpgsql as $$ begin if NEW.provenance='ai_extracted' then raise exception 'injected AI write'; end if; return NEW; end $$; create trigger t25_fail before insert on public.dealtwin_constraints for each row execute function fail_ai_constraint()");
  const before=await evidence(db());
  const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/workflow-runtime')>('../../../lib/server/dealtwin/workflow-runtime');
  await expect(actual.createPostgresWorkflowRuntime(db().appPool,{extractor}).execute('extract',context(1,'extract'),{target:'judge-deal-a',...input()})).rejects.toThrow('injected AI write');
  expect(await evidence(db())).toEqual(before);
  expect((await POST(request('deals/judge-deal-a/constraints/extract',input()),params())).status).toBe(503);expect(await evidence(db())).toEqual(before);
 });
 // The immutable receipt is the operation audit in erp_audit_events, not a
 // separate invented receipt/audit table. Exercise that actual final write.
 it.each(['dealtwin_deal_versions','erp_audit_events'])('rolls back all writes when %s fails',async table=>{
  await db().ownerPool.query(`create function fail_t25_stage() returns trigger language plpgsql as $$ begin raise exception 'injected extraction stage'; end $$; create trigger t25_stage before insert on public.${table} for each row execute function fail_t25_stage()`);
  const before=await evidence(db());const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/workflow-runtime')>('../../../lib/server/dealtwin/workflow-runtime');
  await expect(actual.createPostgresWorkflowRuntime(db().appPool,{extractor}).execute('extract',context(1,'extract'),{target:'judge-deal-a',...input()})).rejects.toThrow('injected extraction stage');
  expect(await evidence(db())).toEqual(before);expect((await graph()).currentVersion.id).toBe('judge-version-a-1');
 });
});
