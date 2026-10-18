import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresCommitmentService } from '../../../lib/server/postgres/postgres-commitment-service';
import { PostgresHarness } from './harness';
import { seed, proofFixture, context, evidence } from './commitment-fixture';

let harness: PostgresHarness;
const cases = [
  { operation: 'reserve', point: 'commitment insert', table: 'dealtwin_liquidity_commitments', event: 'insert', predicate: "new.status='reserved'" },
  { operation: 'reserve', point: 'revision update', table: 'erp_workspaces', event: 'update', predicate: 'new.revision<>old.revision' },
  { operation: 'reserve', point: 'success audit insert', table: 'erp_audit_events', event: 'insert', predicate: "new.action='dealtwin.commitment.reserved'" },
  { operation: 'commit', point: 'Sales Order insert', table: 'erp_sales_orders', event: 'insert', predicate: 'true' },
  { operation: 'commit', point: 'revision update', table: 'erp_workspaces', event: 'update', predicate: 'new.revision<>old.revision' },
  { operation: 'commit', point: 'operational audit insert', table: 'erp_audit_events', event: 'insert', predicate: "new.action='sales_order.created'" },
  { operation: 'commit', point: 'success audit insert', table: 'erp_audit_events', event: 'insert', predicate: "new.action='dealtwin.commitment.committed'" },
] as const;
describe('Task18 atomic rollback after actual PostgreSQL writes', () => {
  beforeAll(async () => { harness = await PostgresHarness.connect(); });
  afterAll(async () => { await harness?.close(); });
  beforeEach(async () => { await harness.resetAndMigrate(); await seed(harness); });
  it.each(cases)('$operation rolls back all rows after $point and its unoccupied key remains retryable', async ({ operation, point, table, event, predicate }) => {
    const a = await proofFixture(harness, 'failure', true);
    if (operation === 'commit') expect((await createPostgresCommitmentService(harness.appPool).reserveLiquidity(context(1, 'failure-reserve'), a.input)).httpStatus).toBe(200);
    const revision = operation === 'reserve' ? 1 : 2;
    const ctx = context(revision, `failure-${operation}-${point.replaceAll(' ', '-')}`);
    const before = await evidence(harness);
    // Identifiers/predicate are fixed test-owned allowlist values, never application input.
    await harness.ownerPool.query(`create function public.t18_failure() returns trigger language plpgsql as $$
      begin if ${predicate} then raise exception 'task18 injected failure'; end if; return new; end $$;
      create trigger t18_failure after ${event} on public.${table} for each row execute function public.t18_failure()`);
    const run = () => operation === 'reserve'
      ? createPostgresCommitmentService(harness.appPool).reserveLiquidity(ctx, a.input)
      : createPostgresCommitmentService(harness.appPool).commitDeal(ctx, a.input);
    try { await expect(run()).rejects.toThrow('task18 injected failure'); }
    finally { await harness.ownerPool.query(`drop trigger t18_failure on public.${table}; drop function public.t18_failure()`); }
    expect(await evidence(harness)).toEqual(before);
    const success = await run(); expect(success.httpStatus).toBe(200); expect(success.body).toMatchObject({ revision: revision + 1 });
    const after = await evidence(harness); expect(await run()).toEqual(success); expect(await evidence(harness)).toEqual(after);
  });
});
