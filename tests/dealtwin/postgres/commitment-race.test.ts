import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJudgeScenario } from '../../../lib/dealtwin/judge/scenario';
import { rupiah } from '../../../lib/dealtwin/domain/money';
import { isoDate } from '../../../lib/dealtwin/domain/date';
import { createPostgresCommitmentService } from '../../../lib/server/postgres/postgres-commitment-service';
import { PostgresErpRepository } from '../../../lib/server/postgres/postgres-erp-repository';
import { withTransaction } from '../../../lib/server/postgres/transaction';
import { PostgresDealTwinRepository } from '../../../lib/server/postgres/postgres-dealtwin-repository';
import type { OperationResponse } from '../../../lib/dealtwin/application/operation-contracts';
import { PostgresHarness, JUDGE_TENANT_ID } from './harness';
import { seed, proofFixture, context, evidence } from './commitment-fixture';
import { runCapacityRace, runLockedOperations } from './race-harness';

let harness: PostgresHarness;
const code = (response: OperationResponse) => (response.body as { error?: { code: string } }).error?.code;
async function capacityProof(suffix: string, amount: bigint) {
  const base = createJudgeScenario().collisionTermsB;
  const terms = { ...base, directCostEvents: [{ ...base.directCostEvents[0]!, amountRupiah: rupiah(amount),
    daysFromAcceptance: 0, effectiveDate: isoDate('2026-09-16') }] };
  return proofFixture(harness, suffix, true, terms);
}
describe('Task18 real independently pooled-client liquidity races', () => {
  beforeAll(async () => { harness = await PostgresHarness.connect(); });
  afterAll(async () => { await harness?.close(); });
  beforeEach(async () => { await harness.resetAndMigrate(); await seed(harness); });
  it.each(Array.from({ length: 20 }, (_value, index) => index + 1))('independently seeded race %i serializes 4m/5m against 7m capacity and rejects the refreshed loser', async iteration => {
    const a = await capacityProof(`race-${iteration}-a`, 4_000_000n);
    const b = await capacityProof(`race-${iteration}-b`, 5_000_000n);
    const requests = [{ context: context(1, `race-${iteration}-left`), input: a.input }, { context: context(1, `race-${iteration}-right`), input: b.input }] as const;
    const results = await runCapacityRace(harness, requests);
    expect(results.filter(result => result.httpStatus === 200)).toHaveLength(1);
    const winnerIndex = results.findIndex(result => result.httpStatus === 200);
    const loserIndex = 1 - winnerIndex;
    expect(code(results[loserIndex]!)).toBe('REVISION_CONFLICT');
    const winner = results[winnerIndex]!;
    expect(winner.body).toMatchObject({ revision: 2, status: 'reserved', minimumProjectedBalanceRupiah: winnerIndex === 0 ? '8000000' : '7000000' });
    const refreshed = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(refreshed.revision).toBe(2);
    const loser = requests[loserIndex]!;
    const collision = await createPostgresCommitmentService(harness.appPool).reserveLiquidity({ ...loser.context, expectedRevision: refreshed.revision }, loser.input);
    expect(code(collision)).toBe('LIQUIDITY_COLLISION');
    expect(collision.body).toMatchObject({ shortfallRupiah: '2000000', firstViolationDate: '2026-09-16', conflictingCommitmentIds: [(winner.body as { commitmentId: string }).commitmentId] });
    const active = await withTransaction(harness.appPool, JUDGE_TENANT_ID, tx => new PostgresDealTwinRepository(tx, JUDGE_TENANT_ID).listActiveCommitments());
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ status: 'reserved', amountRupiah: winnerIndex === 0 ? '4000000' : '5000000' });
    const state = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(state.revision).toBe(2); expect(state.cashMovements).toEqual([]); expect(state.salesOrders).toHaveLength(1);
    expect(state.auditLogs.filter(event => event.action === 'dealtwin.commitment.reserved')).toHaveLength(1);
    expect(state.auditLogs.filter(event => event.action === 'dealtwin.commitment.conflict')).toHaveLength(1);
    expect(state.auditLogs.filter(event => event.action === 'dealtwin.proof.stale')).toHaveLength(1);
  });
  it('concurrent same-key RESERVE returns exactly the original response and one success receipt', async () => {
    const a = await proofFixture(harness, 'same-reserve', true);
    const request = { context: context(1, 'concurrent-reserve'), input: a.input };
    const results = await runCapacityRace(harness, [request, request]);
    expect(results[0].httpStatus).toBe(200); expect(results[1]).toEqual(results[0]);
    const state = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(state.revision).toBe(2); expect(state.auditLogs.filter(event => event.action === 'dealtwin.commitment.reserved')).toHaveLength(1);
    const before = await evidence(harness);
    expect(await createPostgresCommitmentService(harness.appPool).reserveLiquidity(request.context, request.input)).toEqual(results[0]);
    expect(await evidence(harness)).toEqual(before);
  });
  it('concurrent same-key COMMIT uses the real ERP command once and returns the identical linked SO response', async () => {
    const a = await proofFixture(harness, 'same-commit', true);
    expect((await createPostgresCommitmentService(harness.appPool).reserveLiquidity(context(1, 'commit-reserve'), a.input)).httpStatus).toBe(200);
    const request = { context: context(2, 'concurrent-commit'), input: a.input };
    const results = await runLockedOperations(harness, [request, request], 'commit');
    expect(results[0].httpStatus).toBe(200); expect(results[1]).toEqual(results[0]);
    const state = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(state.revision).toBe(3); expect(state.salesOrders).toHaveLength(2); expect(state.cashMovements).toEqual([]);
    expect(state.auditLogs.filter(event => event.action === 'sales_order.created')).toHaveLength(1);
    expect(state.auditLogs.filter(event => event.action === 'dealtwin.commitment.committed')).toHaveLength(1);
    const before = await evidence(harness);
    expect(await createPostgresCommitmentService(harness.appPool).commitDeal(request.context, request.input)).toEqual(results[0]);
    expect(await evidence(harness)).toEqual(before);
  });
  it('concurrent changed payload with the same successful key is rejected before revision or mutable proof status', async () => {
    const a = await capacityProof('same-key-a', 4_000_000n); const b = await capacityProof('same-key-b', 5_000_000n);
    const ctx = context(1, 'same-key-different-payload');
    const results = await runCapacityRace(harness, [{ context: ctx, input: a.input }, { context: ctx, input: b.input }]);
    expect(results.filter(result => result.httpStatus === 200)).toHaveLength(1);
    expect(results.filter(result => code(result) === 'IDEMPOTENCY_KEY_REUSED')).toHaveLength(1);
    const state = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(state.revision).toBe(2); expect(state.auditLogs.filter(event => event.action === 'dealtwin.commitment.reserved')).toHaveLength(1);
    expect(state.auditLogs.filter(event => event.action === 'dealtwin.commitment.conflict')).toHaveLength(0);
  });
});
