import { describe,it,expect } from 'vitest';
import { POST as compile } from '../../../app/api/dealtwin/deals/[dealId]/compile/route';
import { POST as generate } from '../../../app/api/dealtwin/deals/[dealId]/proof/route';
import { POST as recompile } from '../../../app/api/dealtwin/deals/[dealId]/recompile/route';
import { POST as replay } from '../../../app/api/dealtwin/proofs/[proofId]/replay/route';
import { GET as detail, PATCH as edit } from '../../../app/api/dealtwin/deals/[dealId]/route';
import { GET as list, POST as create } from '../../../app/api/dealtwin/deals/route';
import { POST as stress } from '../../../app/api/dealtwin/proofs/[proofId]/stress/route';
import { POST as replace } from '../../../app/api/dealtwin/commitments/[commitmentId]/replace/route';
import { POST as reserve } from '../../../app/api/dealtwin/deals/[dealId]/reserve/route';
import { POST as commit } from '../../../app/api/dealtwin/deals/[dealId]/commit/route';
import { PATCH as apMutation } from '../../../app/api/dealtwin/judge/obligations/[invoiceId]/route';
import { POST as reset } from '../../../app/api/dealtwin/judge/reset/route';
import { proofFixture } from '../postgres/commitment-fixture';
import { createPostgresWorkflowRuntime } from '../../../lib/server/dealtwin/workflow-runtime';
import { createPostgresWorkflowPort } from '../../../lib/server/postgres/postgres-workflow-port';
import { context } from './workflow-harness';
import { POST as approve } from '../../../app/api/dealtwin/approvals/[approvalId]/decision/route';
import { addCalendarDays } from '../../../lib/dealtwin/domain/date';
import { replayProof } from '../../../lib/dealtwin/proof/replay-proof';
import { rupiah } from '../../../lib/dealtwin/domain/money';
import { basisPoints } from '../../../lib/dealtwin/domain/rate';
import { workspace,request,params,mutation,evidence } from './workflow-harness';
import type { ReadDealState } from './workflow-harness';
import type { DealProofDto } from '../../../lib/dealtwin/proof/proof-dto';
import { canonicalizeDealTermsV1 } from '../../../lib/dealtwin/domain/deal-terms';
import { createJudgeScenario } from '../../../lib/dealtwin/judge/scenario';
describe('persistent Deal workflow routes with real app-role PostgreSQL',()=>{
 const db=workspace();
 it('compiles real20% shortfall, solves/persists25% v2 proof, survives fresh reads and preserves original-response retries',async()=>{
  const c={...mutation(1,'compile-initial'),dealVersionId:'judge-version-a-1'};
  const initial=await compile(request('deals/judge-deal-a/compile',c),params()); expect(initial.status).toBe(200); expect(await initial.json()).toMatchObject({outcome:'DOES_NOT_COMPILE',revision:2,shortfallRupiah:'3000000',firstViolationDate:'2026-09-22'});
  const r={...mutation(2,'solve-initial'),dealVersionId:'judge-version-a-1'};
  const amended=await recompile(request('deals/judge-deal-a/recompile',r),params()); expect(amended.status).toBe(200); const candidate=await amended.json() as {dealVersionId:string};
  expect(candidate).toMatchObject({outcome:'PROPOSED_AMENDMENT',revision:3,minimumProjectedBalanceRupiah:'5000000'});
  const generated=await generate(request('deals/judge-deal-a/proof',{...mutation(3,'generate-fixed'),dealVersionId:candidate.dealVersionId}),params());
  expect(generated.status).toBe(200); const proof=await generated.json() as {proof:DealProofDto}; expect(proof).toMatchObject({revision:4,proof:{engineVersion:'dealtwin-engine-v2',status:'CONDITIONALLY_VALID'}});
  const current=await detail(request('deals/judge-deal-a'),params()); const state=await current.json() as ReadDealState; expect(current.status).toBe(200);
  expect(state.currentVersion.terms.customerPaymentEvents[0].basisPoints).toBe(2500); expect(state.proofs.some((row:{id:string})=>row.id===proof.proof.id)).toBe(true);
  const after=await evidence(db()); const retry=await recompile(request('deals/judge-deal-a/recompile',r),params()); expect(await retry.json()).toEqual(candidate); expect(await evidence(db())).toEqual(after);
  const rep={...mutation(4,'replay-fixed')}; const rp=()=>({params:Promise.resolve({proofId:proof.proof.id})});
  const historical=await replay(request('proofs/'+proof.proof.id+'/replay',rep),rp()); expect(historical.status).toBe(200); const response=await historical.json(); expect(response).toMatchObject({revision:5,replayed:true});
  const replayAfter=await evidence(db()); expect(await (await replay(request('proofs/'+proof.proof.id+'/replay',rep),rp())).json()).toEqual(response); expect(await evidence(db())).toEqual(replayAfter);
 });
 it('lists persisted synthetic deals and edits immutable versions without overwriting the previous terms',async()=>{
  const listed=await list(request('deals')); expect(listed.status).toBe(200); expect((await listed.json() as {deals:{id:string}[]}).deals.map((row:{id:string})=>row.id)).toEqual(['judge-deal-a','judge-deal-b']);
  const terms=canonicalizeDealTermsV1(createJudgeScenario().candidateTermsA);
  const edited=await edit(request('deals/judge-deal-a',{...mutation(1,'edit-a'),dealVersionId:'judge-version-a-1',terms},'sales','PATCH'),params()); expect(edited.status).toBe(200);
  const body=await edited.json(); expect(body).toMatchObject({revision:2,version:2});
  const saved=await (await detail(request('deals/judge-deal-a'),params())).json() as ReadDealState;
  expect(saved.versions.find((row:{id:string})=>row.id==='judge-version-a-1')!.terms.customerPaymentEvents[0].basisPoints).toBe(2000);
  expect(saved.currentVersion.terms.customerPaymentEvents[0].basisPoints).toBe(2500);
  const stale=await edit(request('deals/judge-deal-a',{...mutation(2,'edit-stale'),dealVersionId:'judge-version-a-1',terms},'sales','PATCH'),params()); expect(stale.status).toBe(409);
 });
 it('creates a durable draft with exact money DTOs and rejects numeric/oversized/AI money without writes',async()=>{
  const terms=canonicalizeDealTermsV1(createJudgeScenario().candidateTermsA); const input={...mutation(1,'create-one'),title:'Synthetic deal',terms};
  const created=await create(request('deals',input)); expect(created.status).toBe(200); const body=await created.json(); expect(body).toMatchObject({revision:2,status:'DRAFT',version:1});
  const before=await evidence(db()); const bad=structuredClone(terms);
  for(const value of ['60000000.5','9'.repeat(30),60000000]) { const wire=structuredClone(bad); (wire.productLines[0] as {unitPriceRupiah:unknown}).unitPriceRupiah=value; expect((await create(request('deals',{...mutation(2,'invalid-money'),title:'Bad',terms:wire}))).status).toBe(422); }
  expect((await create(request('deals',{...mutation(2,'ai-input'),title:'Bad',terms,aiResult:{cashBalance:'999999999'}}))).status).toBe(422); expect(await evidence(db())).toEqual(before);
 });
 it('denies unauthenticated/session-role/body-tenant injection and stale revision before any workflow write',async()=>{
  const before=await evidence(db()); const input={...mutation(1,'bad-compile'),dealVersionId:'judge-version-a-1'};
  expect((await compile(request('deals/judge-deal-a/compile',input,null),params())).status).toBe(401);
  expect((await compile(request('deals/judge-deal-a/compile',input,'warehouse'),params())).status).toBe(403);
  for(const extra of [{tenantId:'foreign'},{role:'admin'},{result:{outcome:'COMPILES'}},{now:'2026-09-12'}]) expect((await compile(request('deals/judge-deal-a/compile',{...input,...extra}),params())).status).toBe(422);
  expect((await compile(request('deals/judge-deal-a/compile',{...input,expectedRevision:0}),params())).status).toBe(409); expect(await evidence(db())).toEqual(before);
 });
 it('editing cannot persist a draft version with foreign/missing ERP product or warehouse references',async()=>{
  const before=await evidence(db());const terms=canonicalizeDealTermsV1(createJudgeScenario().candidateTermsA);
  for(const field of ['product','warehouse'] as const){const wire=structuredClone(terms);
   if(field==='product')(wire.productLines[0] as {productId:string}).productId='foreign-product';else (wire as {warehouseId:string}).warehouseId='foreign-warehouse';
   const result=await edit(request('deals/judge-deal-a',{...mutation(1,'foreign-'+field),dealVersionId:'judge-version-a-1',terms:wire},'sales','PATCH'),params());expect(result.status).toBe(422);
  }
  expect(await evidence(db())).toEqual(before);
 });
 it('HTTP boundaries reject missing targets, cross-origin, nonJSON and duplicate/invalid stress without business writes',async()=>{
  const a=await proofFixture(db(),'boundaries',true);const before=await evidence(db());const input={...mutation(1,'boundary'),dealVersionId:a.input.dealVersionId};
  expect((await detail(request('deals/missing'),params('missing'))).status).toBe(404);
  const cross=request('deals/'+a.dealId+'/compile',input);cross.headers.set('origin','https://attacker.invalid');expect((await compile(cross,params(a.dealId))).status).toBe(403);
  const nonJson=request('deals/'+a.dealId+'/compile',input);nonJson.headers.set('content-type','text/plain');expect((await compile(nonJson,params(a.dealId))).status).toBe(415);
  const p=()=>({params:Promise.resolve({proofId:a.proof.id})});const scenario={schemaVersion:'dealtwin.stress-scenario.v1',id:'duplicate',type:'customer_receipt_delay',days:3};
  expect((await stress(request('proofs/'+a.proof.id+'/stress',{...mutation(1,'duplicate'),scenarios:[scenario,scenario]}),p())).status).toBe(422);
  expect((await stress(request('proofs/'+a.proof.id+'/stress',{...mutation(1,'unknown-receipt'),scenarios:[{schemaVersion:'dealtwin.stress-scenario.v1',id:'unknown',type:'specified_receipt_delay',eventId:'not-present',days:3}]}),p())).status).toBe(422);
  expect(await evidence(db())).toEqual(before);
 });
 it('persists a real no-solution run rather than inventing a feasible proof or changing cash',async()=>{
  const source=createJudgeScenario().initialTermsA;const terms=canonicalizeDealTermsV1({...source,directCostEvents:[{...source.directCostEvents[0]!,amountRupiah:rupiah(180000000n)}]});
  const edited=await edit(request('deals/judge-deal-a',{...mutation(1,'no-solution-input'),dealVersionId:'judge-version-a-1',terms},'sales','PATCH'),params());expect(edited.status).toBe(200);const version=await edited.json() as {dealVersionId:string};const before=await evidence(db());
  const result=await recompile(request('deals/judge-deal-a/recompile',{...mutation(2,'no-solution-search'),dealVersionId:version.dealVersionId}),params());expect(result.status).toBe(200);expect(await result.json()).toMatchObject({revision:3,outcome:'NO_FEASIBLE_AMENDMENT',feasibleCandidates:0});
  const after=await evidence(db());expect(after.dealtwin_proofs).toEqual(before.dealtwin_proofs);expect(after.erp_cash_movements).toEqual(before.erp_cash_movements);expect(after.dealtwin_liquidity_commitments).toEqual(before.dealtwin_liquidity_commitments);
  const runs=await createPostgresWorkflowPort(db().appPool).transact(context(3,'no-solution-read'),tx=>tx.runs('judge-deal-a')) as {kind:string;outcome:string}[];expect(runs).toHaveLength(1);expect(runs[0]).toMatchObject({kind:'recompile',outcome:'DOES_NOT_COMPILE'});
 });
 it('an out-of-policy draft gets a bounded validation reason, not a database-unavailable error or partial evidence',async()=>{
  const source=createJudgeScenario().candidateTermsA;const terms=canonicalizeDealTermsV1({...source,customerPaymentEvents:[{...source.customerPaymentEvents[0],basisPoints:basisPoints(5000)},{...source.customerPaymentEvents[1],basisPoints:basisPoints(5000)}]});
  const edited=await edit(request('deals/judge-deal-a',{...mutation(1,'over-cap'),dealVersionId:'judge-version-a-1',terms},'sales','PATCH'),params());expect(edited.status).toBe(200);const version=await edited.json() as {dealVersionId:string};const before=await evidence(db());
  const result=await recompile(request('deals/judge-deal-a/recompile',{...mutation(2,'invalid-policy-range'),dealVersionId:version.dealVersionId}),params());expect(result.status).toBe(422);expect(await result.json()).toEqual({ok:false,error:{code:'INVALID_AMENDMENT_POLICY'}});expect(await evidence(db())).toEqual(before);
 });
 it('persists named stress over immutable historical inputs, hashes scenarios distinctly, retries once and never moves cash',async()=>{
  const a=await proofFixture(db(),'http-stress',true);const p=()=>({params:Promise.resolve({proofId:a.proof.id})});const before=await evidence(db());
  const scenario={schemaVersion:'dealtwin.stress-scenario.v1',id:'http-plus-3',type:'customer_receipt_delay',days:3};
  const input={...mutation(1,'http-stress-3'),scenarios:[scenario]};
  const response=await stress(request('proofs/'+a.proof.id+'/stress',input),p());expect(response.status).toBe(200);
  const body=await response.json() as {runs:{inputHash:string;result:{outcome:string;timeline:{minimumProjectedBalance:string}}}[]};
  expect(body).toMatchObject({revision:2,scope:'historical_proof',runs:[{engineVersion:'dealtwin-engine-v2',result:{outcome:'COMPILES',timeline:{minimumProjectedBalance:'5000000'}}}]});
  const after=await evidence(db());expect(after.erp_cash_movements).toEqual(before.erp_cash_movements);expect(after.dealtwin_liquidity_commitments).toEqual(before.dealtwin_liquidity_commitments);expect(after.dealtwin_proofs).toEqual(before.dealtwin_proofs);
  const persisted=await createPostgresWorkflowPort(db().appPool).transact(context(2,'read-stress-run'),tx=>tx.runs(a.dealId)) as {kind:string;input_hash:string;parent_run_id:string;violation_data:{parameters:unknown}}[];
  expect(persisted.filter(row=>row.kind==='stress')).toHaveLength(1);
  expect(persisted.find(row=>row.kind==='stress')).toMatchObject({input_hash:body.runs[0]!.inputHash,parent_run_id:'t16-run-http-stress',violation_data:{parameters:scenario}});
  expect(await (await stress(request('proofs/'+a.proof.id+'/stress',input),p())).json()).toEqual(body);expect(await evidence(db())).toEqual(after);
  const other=await stress(request('proofs/'+a.proof.id+'/stress',{...mutation(2,'http-stress-7'),scenarios:[{...scenario,id:'http-plus-7',days:7}]}),p());expect(other.status).toBe(200);
  const second=await other.json() as typeof body;expect(second.runs[0]!.inputHash).not.toBe(body.runs[0]!.inputHash);
  const actual=await createPostgresWorkflowRuntime(db().appPool).read(context(3,'fresh-instance'),a.dealId);expect(actual.httpStatus).toBe(200);expect(actual.body).toMatchObject({revision:3,currentVersion:{id:a.input.dealVersionId}});
 });
 it('committed AP19m recompile persists a27% proposal only, retaining original current terms/SO/capacity and denying secondCOMMIT',async()=>{
  const a=await proofFixture(db(),'http-committed',true);const p=()=>params(a.dealId);
  const reserved=await reserve(request('deals/'+a.dealId+'/reserve',{...mutation(1,'http-owner-reserve'),...a.input}),p());expect(reserved.status).toBe(200);
  const committed=await commit(request('deals/'+a.dealId+'/commit',{...mutation(2,'http-owner-commit'),...a.input}),p());expect(committed.status).toBe(200);
  const before=await evidence(db());expect((await apMutation(request('judge/obligations/judge-existing-ap',{...mutation(3,'http-owner-ap'),amountRupiah:'19000000'},'admin','PATCH'),{params:Promise.resolve({invoiceId:'judge-existing-ap'})})).status).toBe(200);
  const proposed=await recompile(request('deals/'+a.dealId+'/recompile',{...mutation(4,'http-owner-remediation'),dealVersionId:a.input.dealVersionId}),p());expect(proposed.status).toBe(200);
  const body=await proposed.json() as {proof:DealProofDto};expect(body).toMatchObject({revision:5,outcome:'REMEDIATION_PENDING',minimumProjectedBalanceRupiah:'5200000',proof:{terms:{customerPaymentEvents:[{basisPoints:2700},{basisPoints:7300}]}}});
  const after=await evidence(db());expect(after.dealtwin_liquidity_commitments).toEqual(before.dealtwin_liquidity_commitments);expect(after.erp_sales_orders).toEqual(before.erp_sales_orders);expect(after.erp_cash_movements).toEqual(before.erp_cash_movements);
  const state=await (await detail(request('deals/'+a.dealId),p())).json() as ReadDealState;expect(state.currentVersion.terms.customerPaymentEvents[0].basisPoints).toBe(2500);expect(state.proofs.some(row=>row.id===body.proof.id)).toBe(true);
  expect((await commit(request('deals/'+a.dealId+'/commit',{...mutation(5,'http-second-commit'),...a.input}),p())).status).toBe(409);expect(await evidence(db())).toEqual(after);
 });
 it('reserved AP19m workflow replaces atomically through signed route, preserves original retry even afterJudge reset',async()=>{
  const a=await proofFixture(db(),'http-swap',true);const p=()=>params(a.dealId);
  const reserved=await reserve(request('deals/'+a.dealId+'/reserve',{...mutation(1,'http-swap-reserve'),...a.input}),p());expect(reserved.status).toBe(200);const owner=await reserved.json() as {commitmentId:string};
  expect((await apMutation(request('judge/obligations/judge-existing-ap',{...mutation(2,'http-swap-ap'),amountRupiah:'19000000'},'admin','PATCH'),{params:Promise.resolve({invoiceId:'judge-existing-ap'})})).status).toBe(200);
  const proposed=await recompile(request('deals/'+a.dealId+'/recompile',{...mutation(3,'http-swap-proposal'),dealVersionId:a.input.dealVersionId}),p());expect(proposed.status).toBe(200);const target=await proposed.json() as {proof:DealProofDto};
  const input={...mutation(4,'http-swap-replace'),previous:a.input,replacement:{proofId:target.proof.id,dealVersionId:target.proof.dealVersionId,canonicalEventHash:target.proof.canonicalEventHash}};
  const r=()=>({params:Promise.resolve({commitmentId:owner.commitmentId})});const response=await replace(request('commitments/'+owner.commitmentId+'/replace',input),r());expect(response.status).toBe(200);const body=await response.json();expect(body).toMatchObject({revision:5,operation:'replace',minimumProjectedBalanceRupiah:'5200000'});
  const after=await evidence(db());expect((after.dealtwin_liquidity_commitments as {row:{status:string}}[]).map(row=>row.row.status).sort()).toEqual(['cancelled','reserved']);
  expect((await reset(request('judge/reset',mutation(5,'http-swap-reset')))).status).toBe(200);const resetState=await evidence(db());
  expect(await (await replace(request('commitments/'+owner.commitmentId+'/replace',input),r())).json()).toEqual(body);expect(await evidence(db())).toEqual(resetState);
 });
 it.each(['version','proof','receipt'] as const)('workflow rollback after injected%s leaves no partial version/proof or adopted revision',async point=>{
  const before=await evidence(db());const table=point==='version'?'dealtwin_deal_versions':point==='proof'?'dealtwin_proofs':'erp_audit_events';
  await db().ownerPool.query(`create function public.t22_fail() returns trigger language plpgsql as $$ begin raise exception 'Task22 injected failure'; end $$;create trigger t22_fail after insert on public.${table} for each row execute function public.t22_fail()`);
  try {const result=await recompile(request('deals/judge-deal-a/recompile',{...mutation(1,'rollback-recompile'),dealVersionId:'judge-version-a-1'}),params());expect(result.status).toBe(503);expect(await result.json()).toEqual({ok:false,error:{code:'JUDGE_UNAVAILABLE'}});}
  finally{await db().ownerPool.query(`drop trigger t22_fail on public.${table};drop function public.t22_fail()`);}
  expect(await evidence(db())).toEqual(before);
  const result=await recompile(request('deals/judge-deal-a/recompile',{...mutation(1,'rollback-recompile'),dealVersionId:'judge-version-a-1'}),params());expect(result.status).toBe(200);
 });
 it('a supplier-timing amendment binds both fixed-term requirements and cannot COMMIT after approving only one',async()=>{
  const source=createJudgeScenario().initialTermsA;const terms=canonicalizeDealTermsV1({...source,
   customerPaymentEvents:[source.customerPaymentEvents[0],{...source.customerPaymentEvents[1],daysFromAcceptance:6,effectiveDate:addCalendarDays(source.acceptedDate,6)}],
   directCostEvents:[{...source.directCostEvents[0]!,amountRupiah:rupiah(58500000n)}],
  });
  const edited=await edit(request('deals/judge-deal-a',{...mutation(1,'supplier-case'),dealVersionId:'judge-version-a-1',terms},'sales','PATCH'),params());expect(edited.status).toBe(200);const version=await edited.json() as {dealVersionId:string};
  const proposed=await recompile(request('deals/judge-deal-a/recompile',{...mutation(2,'supplier-solve'),dealVersionId:version.dealVersionId}),params());expect(proposed.status).toBe(200);
  const body=await proposed.json() as {proof:DealProofDto};expect(body.proof.terms).toMatchObject({customerPaymentEvents:[{basisPoints:2000},{daysFromAcceptance:6}],directCostEvents:[{daysFromAcceptance:10}]});
  const rows=body.proof.approvals as unknown as {id:string;requirementCode:string}[];
  expect(rows.map(row=>row.requirementCode).sort()).toEqual(['owner_commercial_exception','supplier_timing_exception']);expect(replayProof(body.proof).ok).toBe(true);
  const identity={proofId:body.proof.id,dealVersionId:body.proof.dealVersionId,canonicalEventHash:body.proof.canonicalEventHash};
  expect((await reserve(request('deals/judge-deal-a/reserve',{...mutation(3,'supplier-reserve'),...identity}),params())).status).toBe(200);
  const authorize=async(revision:number,index:number)=>approve(request('approvals/'+rows[index]!.id+'/decision',{...mutation(revision,'supplier-approval-'+index),proofId:identity.proofId,dealVersionId:identity.dealVersionId,decision:'approved',comment:'Fixed timing reviewed'},'approver'),{params:Promise.resolve({approvalId:rows[index]!.id})});
  expect((await authorize(4,0)).status).toBe(200);const before=await evidence(db());
  expect((await commit(request('deals/judge-deal-a/commit',{...mutation(5,'supplier-commit'),...identity}),params())).status).toBe(409);expect(await evidence(db())).toEqual(before);
  expect((await authorize(5,1)).status).toBe(200);
  const committed=await commit(request('deals/judge-deal-a/commit',{...mutation(6,'supplier-commit'),...identity}),params());expect(committed.status).toBe(200);expect(await committed.json()).toMatchObject({revision:7,status:'committed'});
 });
});
