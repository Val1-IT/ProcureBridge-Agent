import { createIndependentPostgresPool } from '../../../lib/server/postgres/pool';
import { expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresCommitmentService } from '../../../lib/server/postgres/postgres-commitment-service';
import { lockTenantWorkspace } from '../../../lib/server/postgres/proof-invalidation';
import type { MutationContext, OperationResponse, ProofCommandInput } from '../../../lib/dealtwin/application/operation-contracts';
import { JUDGE_TENANT_ID, type PostgresHarness } from './harness';

export interface ReservationRequest { readonly context: MutationContext; readonly input: ProofCommandInput; }

// Test-only resource/control code. Every service query still uses real pg clients and app credentials.
export async function runLockedOperations(harness: PostgresHarness, requests: readonly [ReservationRequest, ReservationRequest], operation: 'reserve' | 'commit'): Promise<readonly [OperationResponse, OperationResponse]> {
  expect(requests.map(request => request.context.tenantId)).toEqual([JUDGE_TENANT_ID, JUDGE_TENANT_ID]);
  const pools = [createIndependentPostgresPool(harness.appPool, { max: 1, application_name: `task18-left-${randomUUID()}` }),
    createIndependentPostgresPool(harness.appPool, { max: 1, application_name: `task18-right-${randomUUID()}` })] as const;
  const gate = await harness.appPool.connect();
  let began = false;
  let operations: readonly Promise<OperationResponse>[] = [];
  try {
    const identities = await Promise.all(pools.map(async pool => (await pool.query(`select pg_backend_pid() as pid,current_user,
      r.rolsuper,r.rolbypassrls from pg_roles r where r.rolname=current_user`)).rows[0]));
    const pids = identities.map(identity => identity.pid as number);
    expect(new Set(pids).size).toBe(2);
    for (const identity of identities) expect(identity).toMatchObject({ current_user: 'dealtwin_app_login', rolsuper: false, rolbypassrls: false });
    await gate.query('begin'); began = true;
    await gate.query('set local statement_timeout = 5000');
    await gate.query("select set_config('app.tenant_id',$1,true)", [JUDGE_TENANT_ID]);
    await lockTenantWorkspace(gate, JUDGE_TENANT_ID);
    let settled = 0;
    operations = pools.map((pool, index) => {
      const service = createPostgresCommitmentService(pool);
      const request = requests[index]!;
      return (operation === 'reserve' ? service.reserveLiquidity(request.context, request.input) : service.commitDeal(request.context, request.input))
        .then(result => { settled++; return result; }, failure => { settled++; throw failure; });
    });
    const combined = Promise.all(operations);
    void combined.catch(() => undefined); // Keep unexpected failures handled while observing the barrier.
    const deadline = Date.now() + 4000;
    let blocked: Array<{ pid: number; query: string }> = [];
    while (Date.now() < deadline && blocked.length !== 2) {
      blocked = (await harness.ownerPool.query<{ pid: number; query: string }>(`select pid,query from pg_stat_activity
        where pid=any($1::int[]) and state='active' and wait_event_type='Lock' order by pid`, [pids])).rows;
      if (blocked.length !== 2) await new Promise(resolve => setTimeout(resolve, 10));
    }
    // These are observed server statements/lock waits, not inferred from a delay or a mocked pool.
    expect(blocked.map(row => row.pid)).toEqual([...pids].sort((a, b) => a - b));
    expect(blocked.every(row => /erp_workspaces/i.test(row.query) && /for update/i.test(row.query))).toBe(true);
    expect(settled).toBe(0);
    await gate.query('commit'); began = false;
    const results = await combined;
    for (const pool of pools) {
      const tenant = (await pool.query("select current_setting('app.tenant_id',true) as tenant")).rows[0].tenant;
      expect(tenant === null || tenant === '').toBe(true);
    }
    return [results[0]!, results[1]!];
  } finally {
    if (began) await gate.query('rollback');
    gate.release();
    await Promise.allSettled(operations);
    await Promise.all(pools.map(pool => pool.end()));
  }
}
export function runCapacityRace(harness: PostgresHarness, requests: readonly [ReservationRequest, ReservationRequest]): Promise<readonly [OperationResponse, OperationResponse]> {
  return runLockedOperations(harness, requests, 'reserve');
}
