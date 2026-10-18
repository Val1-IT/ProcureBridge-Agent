import { expect } from 'vitest';
import { createJudgeScenario } from '../../../lib/dealtwin/judge/scenario';
import { createDealVersion } from '../../../lib/dealtwin/domain/deal';
import type { DealTermsV1 } from '../../../lib/dealtwin/domain/deal-terms';
import type { ConstraintSet } from '../../../lib/dealtwin/domain/constraint';
import type { StoredCommitment } from '../../../lib/dealtwin/application/commitment-service';
import { canonicalCashEventDto } from '../../../lib/dealtwin/domain/canonical-event';
import { buildSnapshot } from '../../../lib/dealtwin/erp/build-snapshot';
import { isoDate } from '../../../lib/dealtwin/domain/date';
import { compileDeal } from '../../../lib/dealtwin/compiler/compile-deal';
import { buildDealProof } from '../../../lib/dealtwin/proof/build-proof';
import { createPostgresJudgeRuntime } from '../../../lib/server/dealtwin/runtime';
import { PostgresDealTwinRepository, createPostgresApplicationPorts } from '../../../lib/server/postgres/postgres-dealtwin-repository';
import { PostgresErpRepository, loadErpWorkspace } from '../../../lib/server/postgres/postgres-erp-repository';
import { decideApproval } from '../../../lib/dealtwin/application/approval-service';
import { withTransaction } from '../../../lib/server/postgres/transaction';
import type { PostgresHarness } from './harness';
import { JUDGE_TENANT_ID } from './harness';

export const actor = { tenantId: JUDGE_TENANT_ID, actorId: 'task16-user', role: 'admin' as const };
export const now = '2026-09-16T12:00:00.000Z';
export const context = (expectedRevision: number, idempotencyKey: string) => ({ ...actor, expectedRevision, idempotencyKey, now });
export async function seed(harness: PostgresHarness) {
  const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
  expect((await runtime.resetJudgeTenant(context(0, 'task16-seed'))).httpStatus).toBe(200);
}
export async function proofFixture(harness: PostgresHarness, suffix = 'a', approved = false, fixedTerms?: DealTermsV1, fixedConstraints?: ConstraintSet,
  commitments: readonly StoredCommitment[] = [], tenantId = JUDGE_TENANT_ID) {
  const scenario = createJudgeScenario();
  const terms = fixedTerms ?? (suffix === 'b' ? scenario.collisionTermsB : scenario.candidateTermsA);
  const constraints = fixedConstraints ?? scenario.constraints;
  const erp = await new PostgresErpRepository(harness.appPool).loadWorkspace(tenantId);
  const version = createDealVersion({ id: `t16-version-${suffix}`, dealId: `t16-deal-${suffix}`, version: 1,
    terms, createdBy: actor.actorId, createdAt: now });
  const snapshot = buildSnapshot({ state: erp, tenantId, asOfDate: isoDate('2026-09-12'),
    requestedHorizonEnd: isoDate('2026-10-12'), adapterVersion: 'dealtwin-erp-adapter-v1', commitments, self: null });
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const codes = approved ? ['owner_commercial_exception'] : [];
  const result = compileDeal({ snapshot: snapshot.value, terms, constraints, policy: scenario.policy, approvedApprovalCodes: codes });
  const approval = { id: `t16-approval-${suffix}`, proofId: `t16-proof-${suffix}`, dealVersionId: version.id,
    kind: 'non_arithmetic_authorization' as const, status: approved ? 'approved' as const : 'pending' as const };
  const built = buildDealProof({ proofId: approval.proofId, dealId: version.dealId, version, snapshot: snapshot.value,
    constraints, policy: scenario.policy, baseResult: result, approvals: [approval], assumptions: [], stressRuns: [], approvedApprovalCodes: codes, generatedAt: now });
  if (!built.ok) throw new Error(built.error.message);
  const proof = built.value.dto;
  await withTransaction(harness.appPool, tenantId, async tx => {
    const repo = new PostgresDealTwinRepository(tx, tenantId);
    await repo.insertDeal({ id: version.dealId, title: 'Task16 synthetic', customerId: terms.customerId, status: 'PROOF_GENERATED', currentVersionId: '', committedSalesOrderId: null }, now);
    await repo.insertDealVersion(version);
    await repo.insertSnapshot({ id: `t16-snapshot-${suffix}`, erpRevision: erp.revision, asOfDate: '2026-09-12', requestedHorizonEnd: '2026-10-12', adapterVersion: proof.adapterVersion,
      dependencyKeys: snapshot.value.dependencyManifest.keys, dependencyManifest: snapshot.value.dependencyManifest, canonicalEvents: snapshot.value.cashEvents.map(canonicalCashEventDto), stateHash: proof.snapshotHash, createdAt: now });
    await repo.insertCompileRun({ id: `t16-run-${suffix}`, dealVersionId: version.id, snapshotId: `t16-snapshot-${suffix}`, kind: 'base', engineVersion: proof.engineVersion,
      inputHash: proof.inputHash, resultHash: proof.resultHash, outcome: result.outcome, cashFloorRupiah: '5000000', shortfallRupiah: null,
      worstMinimumRupiah: result.worstLiquidityPoint!.projectedBalanceAfter.toString(), firstViolationDate: null, violationData: {}, parentRunId: null, createdAt: now });
    await repo.insertProof(proof, `t16-run-${suffix}`);
    await repo.insertApproval({ ...approval, comment: null, decidedBy: null, decidedAt: null }, now);
  });
  return { proof, input: { proofId: proof.id, dealVersionId: version.id, canonicalEventHash: proof.canonicalEventHash }, dealId: version.dealId };
}
export async function approve(harness: PostgresHarness, revision: number, suffix = 'a') {
  const result = await decideApproval(createPostgresApplicationPorts(harness.appPool), { ...context(revision, `approve-${suffix}`), role: 'approver' }, {
    approvalId: `t16-approval-${suffix}`, proofId: `t16-proof-${suffix}`, dealVersionId: `t16-version-${suffix}`, decision: 'approved', comment: 'Fixed terms authorized' });
  expect(result.httpStatus).toBe(200);
}
export async function evidence(harness: PostgresHarness) {
  return withTransaction(harness.appPool, JUDGE_TENANT_ID, async tx => {
    const out: Record<string, unknown> = {};
    for (const table of ['erp_workspaces','erp_sales_orders','erp_sales_order_lines','erp_cash_movements','erp_audit_events','dealtwin_deals','dealtwin_proofs','dealtwin_approvals','dealtwin_liquidity_commitments'] as const) {
      out[table] = (await tx.query(`select to_jsonb(t) row from public.${table} t where tenant_id=$1 order by to_jsonb(t)::text`, [JUDGE_TENANT_ID])).rows;
    }
    out.erp = await loadErpWorkspace(tx, JUDGE_TENANT_ID);
    return out;
  });
}
