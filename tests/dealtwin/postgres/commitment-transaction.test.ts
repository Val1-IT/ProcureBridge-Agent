import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresCommitmentService, createPostgresCommitmentPort, createPostgresRecompilerService } from '../../../lib/server/postgres/postgres-commitment-service';
import { PostgresErpRepository } from '../../../lib/server/postgres/postgres-erp-repository';
import { withTransaction } from '../../../lib/server/postgres/transaction';
import { recordPayment } from '../../../lib/erp/commands/finance';
import { createJudgeScenario } from '../../../lib/dealtwin/judge/scenario';
import { canonicalCashEventDto, hashCanonicalCashEvents } from '../../../lib/dealtwin/domain/canonical-event';
import { PostgresDealTwinRepository, createPostgresApplicationPorts } from '../../../lib/server/postgres/postgres-dealtwin-repository';
import { decideApproval } from '../../../lib/dealtwin/application/approval-service';
import { createPostgresJudgeRuntime } from '../../../lib/server/dealtwin/runtime';
import { lockTenantWorkspace, bumpWorkspaceRevision } from '../../../lib/server/postgres/proof-invalidation';
import { PostgresHarness, JUDGE_TENANT_ID } from './harness';
import { seed, proofFixture, approve, context, evidence } from './commitment-fixture';
import { findSmallestAmendment } from '../../../lib/dealtwin/recompiler/recompile-deal';
import type { AmendmentPolicy } from '../../../lib/dealtwin/recompiler/search-space';
import { prepareCommitmentProof, replayProof } from '../../../lib/dealtwin/proof/replay-proof';
import { buildSnapshot } from '../../../lib/dealtwin/erp/build-snapshot';
import { createDealVersion } from '../../../lib/dealtwin/domain/deal';
import { buildDealProof } from '../../../lib/dealtwin/proof/build-proof';
import { basisPoints } from '../../../lib/dealtwin/domain/rate';
import { runStressLab } from '../../../lib/dealtwin/stress/run-stress-lab';
import { rupiah } from '../../../lib/dealtwin/domain/money';
const amendmentPolicy: AmendmentPolicy = { schemaVersion: 'dealtwin.amendment-policy.v1', depositMaximumBps: basisPoints(4000), earliestCustomerBalanceDays: 2,
  latestSupplierPaymentDays: 14, supplierApprovalPermitted: true, requiredStressScenarios: [{ schemaVersion: 'dealtwin.stress-scenario.v1', id: 'required-receipts-plus-3', type: 'customer_receipt_delay', days: 3 }] };
let harness: PostgresHarness;
const code = (response: { body: unknown }) => (response.body as { error?: { code: string } }).error?.code;
async function changeOneAp() {
  const repo = new PostgresErpRepository(harness.appPool); const state = await repo.loadWorkspace(JUDGE_TENANT_ID); const next = structuredClone(state);
  next.supplierInvoices[0]!.totalAmount=19000000; next.supplierInvoices[0]!.lines[0]!.unitPrice=19000000;
  next.goodsReceipts[0]!.lines[0]!.unitPrice=19000000; next.purchaseOrders[0]!.lines[0]!.unitPrice=19000000; next.revision++;
  await repo.saveAtomic(JUDGE_TENANT_ID,state.revision,next); return next.revision;
}
async function replacementFixture(stress: 'required' | 'missing' | 'optional-failure' = 'required') {
  const old = await proofFixture(harness,'swap-old',true); const service = createPostgresCommitmentService(harness.appPool);
  const reserve = await service.reserveLiquidity(context(1,'swap-old-reserve'),old.input); expect(reserve.httpStatus).toBe(200);
  const commitmentId = (reserve.body as { commitmentId: string }).commitmentId; const revision = await changeOneAp();
  const prepared = prepareCommitmentProof(old.proof); if (!prepared.ok) throw new Error(prepared.error.message);
  const frame = await createPostgresCommitmentPort(harness.appPool).transact(context(revision,'read-proposal'),async tx => {
    const snapshot = buildSnapshot({ state: await tx.loadErp(), tenantId: JUDGE_TENANT_ID, asOfDate: prepared.value.compileInput.snapshot.asOfDate,
      requestedHorizonEnd: prepared.value.compileInput.snapshot.requestedHorizonEnd, adapterVersion: old.proof.adapterVersion, commitments: await tx.listCommitments(), self: old.input });
    if (!snapshot.ok) throw new Error(snapshot.error.message); return { snapshot: snapshot.value, revision: tx.revision };
  });
  const result = findSmallestAmendment({ ...prepared.value.compileInput, snapshot: frame.snapshot, approvedApprovalCodes: [] },amendmentPolicy);
  expect(result.outcome).toBe('AMENDMENT_FOUND'); if (result.outcome!=='AMENDMENT_FOUND') throw new Error('Missing replacement');
  const version = createDealVersion({ id:'t21-version-next',dealId:old.dealId,version:2,terms:result.candidate.terms,createdBy:'task16-user',createdAt:context(1,'x').now });
  const approval = { id:'t21-owner-next',proofId:'t21-proof-next',dealVersionId:version.id,kind:'non_arithmetic_authorization' as const,status:'pending' as const };
  const built = buildDealProof({ proofId:approval.proofId,dealId:old.dealId,version,snapshot:frame.snapshot,constraints:result.candidate.constraints,
    policy:prepared.value.compileInput.policy,baseResult:result.candidate.baseResult,
    stressRuns:stress==='missing'?[]:[...result.candidate.stressRuns,...(stress==='optional-failure'?runStressLab({ ...prepared.value.compileInput,snapshot:frame.snapshot,terms:result.candidate.terms,approvedApprovalCodes:[] },
      [{ schemaVersion:'dealtwin.stress-scenario.v1',id:'optional-plus-7',type:'customer_receipt_delay',days:7 }]):[])],
    assumptions:[],approvals:[approval],approvedApprovalCodes:[],generatedAt:context(1,'x').now });
  if (!built.ok) throw new Error(built.error.message); const proof = built.value.dto;
  await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx => {
    expect(await lockTenantWorkspace(tx,JUDGE_TENANT_ID)).toBe(frame.revision); const repo = new PostgresDealTwinRepository(tx,JUDGE_TENANT_ID);
    await repo.insertDealVersion(version);
    await repo.insertSnapshot({ id:'t21-snapshot-next',erpRevision:frame.revision,asOfDate:frame.snapshot.asOfDate,requestedHorizonEnd:frame.snapshot.requestedHorizonEnd,
      adapterVersion:proof.adapterVersion,dependencyKeys:frame.snapshot.dependencyManifest.keys,dependencyManifest:frame.snapshot.dependencyManifest,canonicalEvents:frame.snapshot.cashEvents.map(canonicalCashEventDto),stateHash:frame.snapshot.stateHash,createdAt:context(1,'x').now });
    await repo.insertCompileRun({ id:'t21-run-next',dealVersionId:version.id,snapshotId:'t21-snapshot-next',kind:'recompile',engineVersion:proof.engineVersion,inputHash:proof.inputHash,resultHash:proof.resultHash,
      outcome:result.candidate.baseResult.outcome,cashFloorRupiah:'5000000',shortfallRupiah:null,worstMinimumRupiah:'5200000',firstViolationDate:null,violationData:{},parentRunId:'t16-run-swap-old',createdAt:context(1,'x').now });
    await repo.insertProof(proof,'t21-run-next'); await repo.insertApproval({ ...approval,comment:null,decidedBy:null,decidedAt:null },context(1,'x').now);
    const updated = await tx.query("update public.dealtwin_deals set current_version_id=$3,status='PROOF_GENERATED' where tenant_id=$1 and id=$2 and committed_sales_order_id is null",[JUDGE_TENANT_ID,old.dealId,version.id]);
    expect(updated.rowCount).toBe(1); expect(await bumpWorkspaceRevision(tx,JUDGE_TENANT_ID,frame.revision,context(1,'x').now)).toBe(4);
  });
  return { old,proof,commitmentId,input:{ commitmentId,previous:old.input,replacement:{ proofId:proof.id,dealVersionId:proof.dealVersionId,canonicalEventHash:proof.canonicalEventHash } } };
}
describe('atomic reserve and commit with real PostgreSQL app role', () => {
  beforeAll(async () => { harness = await PostgresHarness.connect(); });
  afterAll(async () => { await harness?.close(); });
  beforeEach(async () => { await harness.resetAndMigrate(); await seed(harness); });
  it('reserves fixed conditional terms, counts self once, then uses current approval to create exactly one SO/audit/revision', async () => {
    const a = await proofFixture(harness); const b = await proofFixture(harness, 'b');
    const service = createPostgresCommitmentService(harness.appPool);
    const reserved = await service.reserveLiquidity(context(1, 'reserve-a'), a.input);
    expect(reserved.httpStatus).toBe(200);
    expect(reserved.body).toMatchObject({ status: 'reserved', revision: 2, minimumProjectedBalanceRupiah: '5000000' });
    const repo = new PostgresErpRepository(harness.appPool);
    expect((await repo.loadWorkspace(JUDGE_TENANT_ID)).cashMovements).toEqual([]);
    const audits=(await repo.loadWorkspace(JUDGE_TENANT_ID)).auditLogs;
    expect(audits.find(event=>event.action==='dealtwin.proof.stale')?.detail).toMatchObject({schemaVersion:'dealtwin.audit.v1',tenantId:JUDGE_TENANT_ID,
      proofId:b.input.proofId,dealVersionId:b.input.dealVersionId,canonicalEventHash:b.input.canonicalEventHash,priorRevision:1,currentRevision:2});
    expect(audits.find(event=>event.action==='dealtwin.commitment.reserved')?.detail).toMatchObject({schemaVersion:'dealtwin.audit.v1',tenantId:JUDGE_TENANT_ID,
      proofId:a.input.proofId,actorId:'task16-user',actorRole:'admin',idempotencyKey:'reserve-a',priorRevision:1,currentRevision:2});
    await withTransaction(harness.appPool, JUDGE_TENANT_ID, async tx => {
      expect((await tx.query('select status,proof_json from public.dealtwin_proofs where tenant_id=$1 and id=$2', [JUDGE_TENANT_ID,a.input.proofId])).rows[0]).toEqual({ status:'CONDITIONALLY_VALID',proof_json:a.proof });
      expect((await tx.query('select status from public.dealtwin_proofs where tenant_id=$1 and id=$2', [JUDGE_TENANT_ID,b.input.proofId])).rows[0]!.status).toBe('STALE');
    });
    const before = await evidence(harness);
    expect(code(await service.commitDeal(context(2,'commit-a'),a.input))).toBe('APPROVAL_REQUIRED');
    expect(await evidence(harness)).toEqual(before);
    await approve(harness,2);
    const committed = await service.commitDeal(context(3,'commit-a'),a.input);
    expect(committed.httpStatus).toBe(200);
    expect(committed.body).toMatchObject({ status:'committed',revision:4,minimumProjectedBalanceRupiah:'5000000' });
    const erp = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(erp.revision).toBe(4); expect(erp.salesOrders).toHaveLength(2); expect(erp.salesOrders.filter(o=>o.status==='draft')).toHaveLength(1);
    expect(erp.auditLogs.filter(a=>a.action==='sales_order.created')).toHaveLength(1); expect(erp.cashMovements).toEqual([]);
    const final = await evidence(harness);
    expect(await service.reserveLiquidity(context(1,'reserve-a'),a.input)).toEqual(reserved);
    expect(await service.commitDeal(context(3,'commit-a'),a.input)).toEqual(committed);
    expect(code(await service.commitDeal(context(4,'commit-again'),a.input))).toBe('DEAL_ALREADY_COMMITTED');
    expect(code(await service.reserveLiquidity(context(2,'reserve-a'),a.input))).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await evidence(harness)).toEqual(final);
  });
  it('rejects stale expected revision and same key with changed target or actor without writes', async () => {
    const a = await proofFixture(harness); const service=createPostgresCommitmentService(harness.appPool);
    expect(code(await service.reserveLiquidity(context(0,'wrong-revision'),a.input))).toBe('REVISION_CONFLICT');
    const result=await service.reserveLiquidity(context(1,'same-key'),a.input); expect(result.httpStatus).toBe(200);
    const before=await evidence(harness);
    expect(code(await service.reserveLiquidity(context(1,'same-key'),{...a.input,proofId:'other'}))).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(code(await service.reserveLiquidity({...context(1,'same-key'),actorId:'another'},a.input))).toBe('FORBIDDEN_ROLE');
    expect(code(await service.reserveLiquidity({...context(1,'same-key'),role:'warehouse'},a.input))).toBe('FORBIDDEN_ROLE');
    expect(await evidence(harness)).toEqual(before);
  });
  it('persists stale dependency evidence only and creates no commitment or order', async () => {
    const a=await proofFixture(harness); const repo=new PostgresErpRepository(harness.appPool); const erp=await repo.loadWorkspace(JUDGE_TENANT_ID);
    const paid=recordPayment(erp,'finance',{ invoiceId:'judge-existing-ap',direction:'payable',amount:1000000 },'2026-09-13T12:00:00.000Z');
    if (!paid.ok) throw new Error(paid.error.message);
    await repo.saveAtomic(JUDGE_TENANT_ID,1,paid.state);
    const result=await createPostgresCommitmentService(harness.appPool).reserveLiquidity(context(2,'stale'),a.input);
    expect(code(result)).toBe('PROOF_STALE');
    const state=await repo.loadWorkspace(JUDGE_TENANT_ID); expect(state.revision).toBe(2); expect(state.salesOrders).toHaveLength(1);
    expect(state.auditLogs.filter(a=>a.action==='dealtwin.proof.stale')).toHaveLength(1);
    await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{
      expect((await tx.query('select status from public.dealtwin_proofs where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,a.input.proofId])).rows[0]!.status).toBe('STALE');
      expect((await tx.query('select id from public.dealtwin_liquidity_commitments where tenant_id=$1',[JUDGE_TENANT_ID])).rows).toEqual([]);
    });
  });
  it('rejects B capacity collision after A without a second commitment, bank movement or revision increment', async () => {
    const a=await proofFixture(harness); const b=await proofFixture(harness,'b'); const service=createPostgresCommitmentService(harness.appPool);
    expect((await service.reserveLiquidity(context(1,'a'),a.input)).httpStatus).toBe(200);
    const result=await service.reserveLiquidity(context(2,'b'),b.input);
    expect(code(result)).toBe('LIQUIDITY_COLLISION');
    expect(result.body).toMatchObject({ shortfallRupiah:'5000000',firstViolationDate:'2026-09-23' });
    const erp=await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(erp.revision).toBe(2); expect(erp.salesOrders).toHaveLength(1); expect(erp.cashMovements).toEqual([]);
    expect(erp.auditLogs.filter(a=>a.action==='dealtwin.commitment.conflict')).toHaveLength(1);
  });
  it('requires exact stored self tuple and denies duplicate RESERVE with a new key', async () => {
    const a=await proofFixture(harness); const service=createPostgresCommitmentService(harness.appPool);
    expect((await service.reserveLiquidity(context(1,'self'),a.input)).httpStatus).toBe(200);
    const before=await evidence(harness);
    expect(code(await service.reserveLiquidity(context(2,'self-new'),a.input))).toBe('ALREADY_RESERVED');
    expect(code(await service.commitDeal(context(2,'bad-hash'),{...a.input,canonicalEventHash:'b'.repeat(64)}))).toBe('PROOF_IDENTITY_MISMATCH');
    expect(await evidence(harness)).toEqual(before);
  });
  it.each(['write-back','operational-audit','receipt'] as const)('rolls back every row after injected %s failure', async point=>{
    const a=await proofFixture(harness,'a',true); const service=createPostgresCommitmentService(harness.appPool);
    expect((await service.reserveLiquidity(context(1,'rollback-reserve'),a.input)).httpStatus).toBe(200);
    const before=await evidence(harness);
    const table=point==='write-back'?'erp_sales_order_lines':'erp_audit_events';
    const predicate=point==='write-back'?"true":point==='operational-audit'?"new.action='sales_order.created'":"new.action='dealtwin.commitment.committed'";
    await harness.ownerPool.query(`create function public.t16_failure() returns trigger language plpgsql as $$ begin if ${predicate} then raise exception 'task16 injected failure'; end if; return new; end $$;
      create trigger t16_failure after insert on public.${table} for each row execute function public.t16_failure()`);
    try { await expect(service.commitDeal(context(2,'rollback-commit'),a.input)).rejects.toThrow('task16 injected failure'); }
    finally { await harness.ownerPool.query(`drop trigger t16_failure on public.${table}; drop function public.t16_failure()`); }
    expect(await evidence(harness)).toEqual(before);
    expect((await service.commitDeal(context(2,'rollback-commit'),a.input)).httpStatus).toBe(200);
  });
  it.each(['hash','payload'] as const)('does not exclude a corrupted stored self %s',async corruption=>{
    const a=await proofFixture(harness,'a',true);
    const events=createJudgeScenario().candidateResult.timeline!.events.filter(e=>e.dependencyKey.startsWith('deal:event:')).map(canonicalCashEventDto);
    const encoded=corruption==='payload'?events.map(e=>({...(e as Record<string,unknown>),amountRupiah:'1'})):events;
    await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{
      await new PostgresDealTwinRepository(tx,JUDGE_TENANT_ID).insertCommitment({id:'corrupt-self',proofId:a.input.proofId,dealVersionId:a.input.dealVersionId,
        accountId:'judge-cash',canonicalEventHash:corruption==='hash'?'b'.repeat(64):a.input.canonicalEventHash,canonicalEvents:encoded,
        amountRupiah:'42000000',direction:'outflow',status:'reserved',reserveIdempotencyKey:'corrupt-fixture',createdAt:context(1,'x').now,updatedAt:context(1,'x').now});
    });
    const before=await evidence(harness);
    const result=await createPostgresCommitmentService(harness.appPool).commitDeal(context(1,'corrupt-commit'),a.input);
    expect(code(result)).toBe(corruption==='hash'?'SELF_RESERVATION_MISMATCH':'COMMITMENT_HASH_MISMATCH');
    expect(await evidence(harness)).toEqual(before);
  });
  it('reads rejected current approval rather than rewriting or trusting approved historical proof',async ()=>{
    const a=await proofFixture(harness,'a',true); const service=createPostgresCommitmentService(harness.appPool);
    expect((await service.reserveLiquidity(context(1,'reject-reserve'),a.input)).httpStatus).toBe(200);
    const rejection=await decideApproval(createPostgresApplicationPorts(harness.appPool),{...context(2,'reject-approval'),role:'approver'},
      {approvalId:'t16-approval-a',proofId:a.input.proofId,dealVersionId:a.input.dealVersionId,decision:'rejected',comment:'Authorization revoked'});
    expect(rejection.httpStatus).toBe(200);
    const before=await evidence(harness);
    expect(code(await service.commitDeal(context(3,'rejected-commit'),a.input))).toBe('APPROVAL_REJECTED');
    expect(await evidence(harness)).toEqual(before);
  });
  it('denies direct commit, wrong route target, foreign context, and owner/reset database credentials',async ()=>{
    const a=await proofFixture(harness,'a',true); const service=createPostgresCommitmentService(harness.appPool);
    const before=await evidence(harness);
    expect(code(await service.commitDeal(context(1,'no-reserve'),a.input))).toBe('RESERVATION_REQUIRED');
    expect(code(await service.reserveLiquidity(context(1,'wrong-deal'),{...a.input,dealId:'different-deal'}))).toBe('PROOF_IDENTITY_MISMATCH');
    expect(code(await service.reserveLiquidity({...context(1,'foreign'),tenantId:'foreign'},a.input))).toBe('FORBIDDEN_JUDGE_CONTEXT');
    for (const pool of [harness.ownerPool,harness.resetPool]) {
      await expect(createPostgresCommitmentService(pool).reserveLiquidity(context(1,'wrong-db-role'),a.input)).rejects.toThrow('least-privilege');
    }
    expect(await evidence(harness)).toEqual(before);
  });
  it('retains actual reserve/commit receipts across reset, but removed proofs cannot authorize a new key',async ()=>{
    const a=await proofFixture(harness,'a',true); const service=createPostgresCommitmentService(harness.appPool);
    const reserved=await service.reserveLiquidity(context(1,'historic-reserve'),a.input); expect(reserved.httpStatus).toBe(200);
    const committed=await service.commitDeal(context(2,'historic-commit'),a.input); expect(committed.httpStatus).toBe(200);
    const runtime=createPostgresJudgeRuntime(harness.appPool,harness.resetPool);
    expect((await runtime.resetJudgeTenant(context(3,'after-actual-commit'))).httpStatus).toBe(200);
    const before=await evidence(harness);
    const restarted=createPostgresCommitmentService(harness.appPool);
    expect(await restarted.reserveLiquidity(context(1,'historic-reserve'),a.input)).toEqual(reserved);
    expect(await restarted.commitDeal(context(2,'historic-commit'),a.input)).toEqual(committed);
    expect(code(await restarted.reserveLiquidity(context(4,'new-after-reset'),a.input))).toBe('PROOF_NOT_FOUND');
    expect(await evidence(harness)).toEqual(before);
  });
  it('reserves a valid fixed deal with no new procurement cash outflow without inventing a cost',async ()=>{
    const a=await proofFixture(harness,'a',true,{...createJudgeScenario().candidateTermsA,directCostEvents:[]});
    const result=await createPostgresCommitmentService(harness.appPool).reserveLiquidity(context(1,'no-outflow'),a.input);
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({minimumProjectedBalanceRupiah:'12000000',revision:2});
    await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{
      const rows=(await tx.query('select amount_rupiah::text amount,direction,canonical_events from public.dealtwin_liquidity_commitments where tenant_id=$1',[JUDGE_TENANT_ID])).rows;
      expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({amount:'60000000',direction:'inflow'});
      expect(rows[0]!.canonical_events.every((e:{direction:string})=>e.direction==='inflow')).toBe(true);
    });
  });
  it.each(['reserve','commit'] as const)('denies %s when one approval row cannot prove coverage of multiple required codes',async operation=>{
    const scenario=createJudgeScenario();
    const a=await proofFixture(harness,'a',false,undefined,{constraints:[...scenario.constraints.constraints,
      {id:'second-authorization',kind:'required_approval',operator:'eq',value:{approvalCode:'supplier_exception'},provenance:'judge_seed',resolution:'confirmed',sourceText:null}]});
    const events=scenario.candidateResult.timeline!.events.filter(e=>e.dependencyKey.startsWith('deal:event:')).map(canonicalCashEventDto);
    if (operation==='commit') {
      // A genuine pre-existing reservation fixture, not a new lifecycle/replace service. Same exact candidate tuple.
      await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{
        expect(await lockTenantWorkspace(tx,JUDGE_TENANT_ID)).toBe(1);
        await new PostgresDealTwinRepository(tx,JUDGE_TENANT_ID).insertCommitment({id:'multi-code-self',proofId:a.input.proofId,dealVersionId:a.input.dealVersionId,
          accountId:'judge-cash',canonicalEventHash:a.input.canonicalEventHash,canonicalEvents:events,amountRupiah:'42000000',direction:'outflow',status:'reserved',
          reserveIdempotencyKey:'multi-code-history',createdAt:context(1,'x').now,updatedAt:context(1,'x').now});
        await tx.query("update public.dealtwin_deals set status='RESERVED' where tenant_id=$1 and id=$2",[JUDGE_TENANT_ID,a.dealId]);
        expect(await bumpWorkspaceRevision(tx,JUDGE_TENANT_ID,1,context(1,'x').now)).toBe(2);
      });
      await approve(harness,2);
    }
    const before=await evidence(harness);
    const service=createPostgresCommitmentService(harness.appPool);
    const result=operation==='reserve'?await service.reserveLiquidity(context(1,'multi-reserve'),a.input):await service.commitDeal(context(3,'multi-commit'),a.input);
    expect(result).toMatchObject({httpStatus:422,body:{ok:false,error:{code:'UNSUPPORTED_APPROVAL_BINDING'}}});
    expect(await evidence(harness)).toEqual(before);
  });
  it('atomically replaces a STALE still-reserved owner with a newly proved version, preserving historical events and one revision',async()=>{
    const a = await replacementFixture(); const before = await evidence(harness); const service = createPostgresCommitmentService(harness.appPool);
    const result = await service.replaceReservation(context(4,'replace-owner'),a.input); expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ operation:'replace',revision:5,previousCommitmentId:a.commitmentId,status:'reserved',minimumProjectedBalanceRupiah:'5200000' });
    const rows = await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx => (await tx.query('select * from public.dealtwin_liquidity_commitments where tenant_id=$1 order by id',[JUDGE_TENANT_ID])).rows);
    expect(rows).toHaveLength(2); const previous = rows.find(row=>row.id===a.commitmentId)!; const replacement = rows.find(row=>row.id!==a.commitmentId)!;
    expect(previous.status).toBe('cancelled'); expect(previous.proof_id).toBe(a.old.proof.id); expect(previous.canonical_event_hash).toBe(a.old.proof.canonicalEventHash);
    expect(previous.canonical_events).toEqual((before.dealtwin_liquidity_commitments as { row:{ canonical_events:unknown } }[])[0]!.row.canonical_events);
    expect(replacement.status).toBe('reserved'); expect(replacement.proof_id).toBe(a.proof.id); expect(replacement.reserve_idempotency_key).toBe('replace-owner');
    const after = await evidence(harness); expect(after.erp_cash_movements).toEqual(before.erp_cash_movements); expect(after.erp_sales_orders).toEqual(before.erp_sales_orders);
    expect((await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID)).revision).toBe(5);
    const receipts = await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx => (await tx.query("select detail from public.erp_audit_events where tenant_id=$1 and detail->>'idempotencyKey'=$2 and detail->>'operationSucceeded'='true'",[JUDGE_TENANT_ID,'replace-owner'])).rows);
    expect(receipts).toHaveLength(1); expect(replayProof(a.old.proof).ok).toBe(true); expect(replayProof(a.proof).ok).toBe(true);
    expect(await service.replaceReservation(context(4,'replace-owner'),a.input)).toEqual(result); expect(await evidence(harness)).toEqual(after);
    expect(code(await service.replaceReservation(context(4,'replace-owner'),{ ...a.input,previous:{ ...a.input.previous,canonicalEventHash:'f'.repeat(64) } }))).toBe('IDEMPOTENCY_KEY_REUSED');
    const row = await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx => (await tx.query('select status,proof_json from public.dealtwin_proofs where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,a.proof.id])).rows[0]);
    expect(row.status).toBe('CONDITIONALLY_VALID'); expect(row.proof_json).toEqual(a.proof);
  });
  it.each(['retire','insert','revision','receipt'] as const)('replacement rolls back all writes when failure occurs after %s',async point=>{
    const a = await replacementFixture(); const before = await evidence(harness);
    const table = point==='retire'||point==='insert'?'dealtwin_liquidity_commitments':point==='revision'?'erp_workspaces':'erp_audit_events';
    const event = point==='retire'||point==='revision'?'update':'insert';
    await harness.ownerPool.query(`create function public.t21_failure() returns trigger language plpgsql as $$ begin raise exception 'task21 replacement failure'; end $$;create trigger t21_failure after ${event} on public.${table} for each row execute function public.t21_failure()`);
    try { await expect(createPostgresCommitmentService(harness.appPool).replaceReservation(context(4,'replace-failure'),a.input)).rejects.toThrow('task21 replacement failure'); }
    finally { await harness.ownerPool.query(`drop trigger t21_failure on public.${table};drop function public.t21_failure()`); }
    expect(await evidence(harness)).toEqual(before);
    expect((await createPostgresCommitmentService(harness.appPool).replaceReservation(context(4,'replace-failure'),a.input)).httpStatus).toBe(200);
  });
  it('replacement never exempts an old tuple whose internally consistent events/hash differ from its immutable historical proof',async()=>{
    const a=await replacementFixture();
    const old=await createPostgresCommitmentPort(harness.appPool).transact(context(4,'read-old-events'),tx=>tx.getCommitment(a.commitmentId));
    expect(old).not.toBeNull();
    const events=old!.events.map((event,index)=>index===0?{ ...event,amountRupiah:rupiah(event.amountRupiah+1n) }:event);
    const hash=hashCanonicalCashEvents(events);
    // Simulate inconsistent imported historical evidence without disabling immutable-event guards.
    // The raw repository permits a proof/version-bound row; the allocation boundary must additionally bind its hash to that proof.
    await createPostgresCommitmentPort(harness.appPool).transact(context(4,'import-old-corrupt'),async tx=>{
      await tx.transitionCommitment({ commitment:old!,input:{ commitmentId:old!.id,...a.input.previous },operation:'cancel',status:'cancelled',allowedStatuses:['reserved'] });
      await tx.insertReservation({ id:'corrupt-imported-owner',input:{ ...a.input.previous,canonicalEventHash:hash },accountId:old!.accountId,
        events:events.map(canonicalCashEventDto),amountRupiah:'42000000',direction:'outflow' });
    });
    const before=await evidence(harness);
    expect(code(await createPostgresCommitmentService(harness.appPool).replaceReservation(context(4,'corrupt-old-proof'),{
      ...a.input,commitmentId:'corrupt-imported-owner',previous:{ ...a.input.previous,canonicalEventHash:hash } }))).toBe('PROOF_IDENTITY_MISMATCH');
    expect(await evidence(harness)).toEqual(before);
  });
  it('replacement enforces tenant/role/revision/old identity and replays its original receipt after lifecycle and Judge reset',async()=>{
    const a=await replacementFixture(); const service=createPostgresCommitmentService(harness.appPool); const before=await evidence(harness);
    expect(code(await service.replaceReservation({ ...context(4,'foreign-swap'),tenantId:'foreign' },a.input))).toBe('FORBIDDEN_JUDGE_CONTEXT');
    expect(code(await service.replaceReservation({ ...context(4,'finance-swap'),role:'finance' },a.input))).toBe('FORBIDDEN_ROLE');
    expect(code(await service.replaceReservation(context(3,'old-revision-swap'),a.input))).toBe('REVISION_CONFLICT');
    expect(code(await service.replaceReservation(context(4,'wrong-owner-swap'),{ ...a.input,previous:{ ...a.input.previous,canonicalEventHash:'f'.repeat(64) } }))).toBe('COMMITMENT_IDENTITY_MISMATCH');
    expect(await evidence(harness)).toEqual(before);
    const result=await service.replaceReservation(context(4,'durable-swap'),a.input); expect(result.httpStatus).toBe(200);
    const id=(result.body as { commitmentId:string }).commitmentId;
    expect((await service.releaseCommitment(context(5,'release-replaced'),{ commitmentId:id,...a.input.replacement })).httpStatus).toBe(200);
    expect(await service.replaceReservation(context(4,'durable-swap'),a.input)).toEqual(result);
    expect((await createPostgresJudgeRuntime(harness.appPool,harness.resetPool).resetJudgeTenant(context(6,'reset-replaced'))).httpStatus).toBe(200);
    const after=await evidence(harness);
    expect(await createPostgresCommitmentService(harness.appPool).replaceReservation(context(4,'durable-swap'),a.input)).toEqual(result);
    expect(await evidence(harness)).toEqual(after);
  });
  it.each([{ stress:'missing',expected:'REQUIRED_STRESS_EVIDENCE_MISSING' },{ stress:'optional-failure',expected:null }] as const)('replacement uses server-required stress only: $stress',async ({ stress,expected })=>{
    const a=await replacementFixture(stress); const before=await evidence(harness);
    const result=await createPostgresCommitmentService(harness.appPool).replaceReservation(context(4,'stress-bound-swap'),a.input);
    if (expected) { expect(code(result)).toBe(expected); expect(await evidence(harness)).toEqual(before); }
    else { expect(result.httpStatus).toBe(200); expect(result.body).toMatchObject({ revision:5,minimumProjectedBalanceRupiah:'5200000' }); }
  });
  it('replacement refuses newly stale ERP dependencies and leaves the old occupied reservation intact',async()=>{
    const a=await replacementFixture(); const repo=new PostgresErpRepository(harness.appPool); const state=await repo.loadWorkspace(JUDGE_TENANT_ID); const next=structuredClone(state);
    next.customers[0]!.creditLimit=next.customers[0]!.creditLimit-1; next.revision++;
    await repo.saveAtomic(JUDGE_TENANT_ID,4,next); const before=await evidence(harness);
    expect(code(await createPostgresCommitmentService(harness.appPool).replaceReservation(context(5,'stale-swap'),a.input))).toBe('PROOF_STALE');
    expect(await evidence(harness)).toEqual(before);
    const old=await createPostgresCommitmentPort(harness.appPool).transact(context(5,'stale-old'),tx=>tx.getCommitment(a.commitmentId));
    expect(old?.status).toBe('reserved'); expect((await repo.loadWorkspace(JUDGE_TENANT_ID)).revision).toBe(5);
  });
  it('replacement detects a zero-row conditional retirement and rolls back without a capacity gap',async()=>{
    const a=await replacementFixture(); const before=await evidence(harness);
    await harness.ownerPool.query(`create function public.t21_zero() returns trigger language plpgsql as $$ begin return null; end $$;create trigger t21_zero before update on public.dealtwin_liquidity_commitments for each row execute function public.t21_zero()`);
    try { await expect(createPostgresCommitmentService(harness.appPool).replaceReservation(context(4,'zero-retire'),a.input)).rejects.toThrow('exactly one authorized tuple'); }
    finally { await harness.ownerPool.query('drop trigger t21_zero on public.dealtwin_liquidity_commitments;drop function public.t21_zero()'); }
    expect(await evidence(harness)).toEqual(before);
  });
  it('a committed Deal receives a projection only, retains its occupied row/SO, and cannot replace or COMMIT twice',async()=>{
    const a = await proofFixture(harness,'committed-projection',true); const service = createPostgresCommitmentService(harness.appPool);
    const reserved = await service.reserveLiquidity(context(1,'projection-reserve'),a.input); expect(reserved.httpStatus).toBe(200);
    expect((await service.commitDeal(context(2,'projection-commit'),a.input)).httpStatus).toBe(200); expect(await changeOneAp()).toBe(4);
    const commitmentId = (reserved.body as { commitmentId:string }).commitmentId; const before = await evidence(harness);
    const result = await createPostgresRecompilerService(harness.appPool).previewRecompile(context(4,'projection-only'),{ commitmentId,previous:a.input },amendmentPolicy);
    expect(result.httpStatus).toBe(200); expect(result.body).toMatchObject({ outcome:'REMEDIATION_PENDING',minimumProjectedBalanceRupiah:'5200000' });
    expect(await evidence(harness)).toEqual(before);
    expect(code(await service.replaceReservation(context(4,'committed-replace'),{ commitmentId,previous:a.input,replacement:a.input }))).toBe('DEAL_ALREADY_COMMITTED');
    expect(code(await service.commitDeal(context(4,'second-committed-order'),a.input))).toBe('DEAL_ALREADY_COMMITTED'); expect(await evidence(harness)).toEqual(before);
  });
});
