import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";

import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { buildDealProof, type ProofBuildInput } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof, type DealProofDto } from "../../../lib/dealtwin/proof/proof-dto";
import { replayProof } from "../../../lib/dealtwin/proof/replay-proof";
import { createJudgeFixture } from "../fixtures/judge-scenario";
import { withTransaction } from "../../../lib/server/postgres/transaction";
import {
  DEAL_TWIN_APP_ROLE,
  DEAL_TWIN_RESET_ROLE,
  JUDGE_TENANT_ID,
  PostgresHarness,
  probeTenantAccess,
  requiredTestDatabaseUrl,
} from "./harness";

const GENERATED_AT = "2026-09-16T08:00:00.000Z";
const HASH = "a".repeat(64);

let harness: PostgresHarness;

describe("DealTwin PostgreSQL RLS and live transactions", () => {
  beforeAll(async () => {
    harness = await PostgresHarness.connect(requiredTestDatabaseUrl());
    await seedIsolationFixtures(harness.ownerPool);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("does not use a table-owner or superuser role for application access", async () => {
    const client = await harness.appPool.connect();
    try {
      const identity = await client.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        tableowner: string;
      }>(`
        select current_user,
               r.rolsuper,
               r.rolbypassrls,
               t.tableowner
        from pg_roles r
        join pg_tables t on t.tablename = 'erp_cash_accounts' and t.schemaname = 'public'
        where r.rolname = current_user
      `);
      const row = identity.rows[0];
      expect(row?.rolsuper).toBe(false);
      expect(row?.rolbypassrls).toBe(false);
      expect(row?.current_user).not.toBe(row?.tableowner);
      expect(row?.current_user).toBe("dealtwin_app_login");
    } finally {
      client.release();
    }
  });

  it("hides all tenant rows when app.tenant_id is missing or blank", async () => {
    const client = await harness.appPool.connect();
    try {
      await client.query("begin");
      const missing = await client.query("select count(*)::int as n from public.erp_cash_accounts");
      expect(missing.rows[0].n).toBe(0);
      await client.query("select set_config('app.tenant_id', $1, true)", [""]);
      const blank = await client.query("select count(*)::int as n from public.erp_cash_accounts");
      expect(blank.rows[0].n).toBe(0);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("denies application/reset login role escalation without modifying foreign state", async () => {
    for(const pool of [harness.appPool,harness.resetPool]){
      const client=await pool.connect();
      try{
        await client.query('begin');
        for(const role of ['dealtwin',pool===harness.appPool?'dealtwin_judge_reset':'dealtwin_app'])
          await expect(withSavepoint(client,()=>client.query(`set local role ${role}`))).rejects.toMatchObject({code:'42501'});
        await client.query('rollback');
      }finally{client.release();}
    }
  });

  it("enforces FORCE RLS for a table owner without SUPERUSER or BYPASSRLS", async () => {
    const client=await harness.ownerPool.connect();
    try{
      await client.query('begin');
      await client.query('create role dealtwin_task28_owner nologin nosuperuser nobypassrls');
      await client.query('alter table public.erp_cash_accounts owner to dealtwin_task28_owner');
      await client.query('set local role dealtwin_task28_owner');
      await client.query("select set_config('app.tenant_id','tenant-a',true)");
      // Owner bypass would expose both A and B; FORCE RLS still applies.
      expect((await client.query('select id from public.erp_cash_accounts')).rows).toEqual([]);
      await client.query('rollback');
    }finally{await client.query('rollback');client.release();}
  });

  it("isolates SELECT/INSERT/UPDATE/DELETE across tenants for the application role", async () => {
    await withTransaction(harness.appPool, "tenant-a", async (client) => {
      const seen = await client.query("select id from public.erp_cash_accounts order by id");
      expect(seen.rows.map((row) => row.id)).toEqual(["cash-a"]);
      await expect(withSavepoint(client, () => client.query(`
        insert into public.erp_cash_accounts (
          tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
          opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
        ) values (
          'tenant-b', 'cash-from-a', 'BANK-B', 'Hijack', 'IDR', 1, '2026-09-12',
          'opening_balance', 'x', '1', true, '2026-09-12T08:00:00Z', '2026-09-12T08:00:00Z'
        )
      `))).rejects.toThrow();
      const hiddenUpdate = await client.query("update public.erp_cash_accounts set name = 'stolen' where tenant_id = 'tenant-b'");
      expect(hiddenUpdate.rowCount).toBe(0);
      const renamed = await client.query("update public.erp_cash_accounts set name = 'renamed-a' where tenant_id = 'tenant-a' returning name");
      expect(renamed.rowCount).toBe(1);
      await expect(withSavepoint(client, () => client.query("update public.erp_cash_accounts set tenant_id = 'tenant-b' where tenant_id = 'tenant-a'"))).rejects.toThrow();
      await expect(withSavepoint(client, () => client.query("delete from public.erp_cash_accounts where tenant_id = 'tenant-b'"))).rejects.toThrow();
      await expect(withSavepoint(client, () => client.query("delete from public.erp_cash_accounts where tenant_id = 'tenant-a'"))).rejects.toThrow();
    });

    await withTransaction(harness.appPool, "tenant-b", async (client) => {
      const seen = await client.query("select id, name from public.erp_cash_accounts");
      expect(seen.rows).toEqual([{ id: "cash-b", name: "Cash B" }]);
    });
  });

  it("records probeTenantAccess outcomes for app and reset roles", async () => {
    const url = requiredTestDatabaseUrl();
    const appA = await probeTenantAccess(url, DEAL_TWIN_APP_ROLE, "tenant-a");
    expect(appA.outcomes.find((outcome) => outcome.action === "select")?.allowed).toBe(true);
    expect(appA.outcomes.find((outcome) => outcome.action === "insert_other")?.allowed).toBe(false);
    expect(appA.outcomes.find((outcome) => outcome.action === "delete")?.allowed).toBe(false);

    const resetForeign = await probeTenantAccess(url, DEAL_TWIN_RESET_ROLE, "tenant-a");
    expect(resetForeign.outcomes.every((outcome) => outcome.allowed === false || outcome.action === "select")).toBe(true);
    expect(resetForeign.outcomes.find((outcome) => outcome.action === "select")?.allowed).toBe(false);

    const resetJudge = await probeTenantAccess(url, DEAL_TWIN_RESET_ROLE, JUDGE_TENANT_ID);
    expect(resetJudge.outcomes.find((outcome) => outcome.action === "select")?.allowed).toBe(true);
    expect(resetJudge.outcomes.find((outcome) => outcome.action === "insert_other")?.allowed).toBe(false);
  });

  it("hides and protects an existing foreign DealTwin aggregate under the real application login",async()=>{
    await withTransaction(harness.appPool,'tenant-b',async client=>{
      for(const table of ['dealtwin_deals','dealtwin_deal_versions','dealtwin_erp_snapshots','dealtwin_compile_runs','dealtwin_proofs']){
        expect((await client.query(`select id from public.${table} where tenant_id='tenant-a'`)).rows).toEqual([]);
        await expect(withSavepoint(client,()=>client.query(`delete from public.${table} where tenant_id='tenant-a'`))).rejects.toMatchObject({code:'42501'});
      }
      expect((await client.query("update public.dealtwin_deals set title='stolen' where tenant_id='tenant-a'")).rowCount).toBe(0);
      await expect(withSavepoint(client,()=>client.query("insert into public.dealtwin_deals(tenant_id,id,title,customer_id,status) values('tenant-a','foreign-insert','Hijack','customer-a','DRAFT')"))).rejects.toMatchObject({code:'42501'});
    });
    await withTransaction(harness.appPool,'tenant-a',async client=>{
      expect((await client.query("select title from public.dealtwin_deals where tenant_id='tenant-a' and id='deal-a'")).rows).toEqual([{title:'Deal A'}]);
    });
  });

  it("rejects a cross-tenant proof foreign key", async () => {
    const client = await harness.ownerPool.connect();
    try {
      await expect(client.query(`
        insert into public.dealtwin_approvals (
          tenant_id, id, deal_version_id, proof_id, requirement_code, status,
          decided_by, decided_at, comment, decision_idempotency_key, created_at, updated_at
        ) values (
          'tenant-b', 'approval-cross', 'version-a', 'proof-a', 'owner_commercial_exception', 'pending',
          null, null, null, null, '2026-09-16T08:00:00Z', '2026-09-16T08:00:00Z'
        )
      `)).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("round-trips canonical proof JSONB including large decimal strings and replays it", async () => {
    const proof = canonicalProof();
    const client = await harness.ownerPool.connect();
    try {
      await client.query(
        `update public.dealtwin_proofs
         set proof_json = $3::jsonb
         where tenant_id = $1 and id = $2`,
        ["tenant-a", "proof-a", JSON.stringify(proof)],
      );
      const fetched = await client.query<{ proof_json: DealProofDto; opening: string }>(
        `select p.proof_json, a.opening_balance_rupiah::text as opening
         from public.dealtwin_proofs p
         join public.erp_cash_accounts a on a.tenant_id = p.tenant_id and a.id = 'cash-a'
         where p.tenant_id = $1 and p.id = $2`,
        ["tenant-a", "proof-a"],
      );
      const dto = fetched.rows[0]?.proof_json;
      expect(dto?.id).toBe(proof.id);
      expect(fetched.rows[0]?.opening).toBe("9007199254740993");
      await client.query(`
        insert into public.dealtwin_liquidity_commitments (
          tenant_id, id, proof_id, deal_version_id, account_id, canonical_event_hash, canonical_events,
          amount_rupiah, direction, status, reserve_idempotency_key, created_at, updated_at
        ) values (
          'tenant-a', 'commit-large', 'proof-a', 'version-a', 'cash-a', $1,
          $2::jsonb, 9007199254740993, 'outflow', 'reserved', 'reserve-large',
          '2026-09-16T08:00:00Z', '2026-09-16T08:00:00Z'
        )
      `, [HASH, JSON.stringify([{ amountRupiah: "9007199254740993" }])]);
      const events = await client.query<{ amount: string }>(
        `select canonical_events->0->>'amountRupiah' as amount
         from public.dealtwin_liquidity_commitments
         where tenant_id = 'tenant-a' and id = 'commit-large'`,
      );
      expect(events.rows[0]?.amount).toBe("9007199254740993");
      const replay = replayProof(dto as DealProofDto);
      expect(replay.ok, replay.ok ? undefined : replay.error.message).toBe(true);
    } finally {
      client.release();
    }
  });

  it("keeps transaction-local tenant context on one checked-out client and does not leak after commit or rollback", async () => {
    const seen: string[] = [];
    await withTransaction(harness.appPool, "tenant-a", async (client) => {
      const setting = await client.query("select current_setting('app.tenant_id', true) as tenant_id");
      seen.push(setting.rows[0].tenant_id);
      await client.query("select id from public.erp_cash_accounts");
    });

    await expect(withTransaction(harness.appPool, "tenant-a", async (client) => {
      await client.query(`
        insert into public.erp_cash_accounts (
          tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
          opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
        ) values (
          'tenant-a', 'cash-rollback', 'ROLL', 'Rollback', 'IDR', 1, '2026-09-12',
          'opening_balance', 'rollback', '1', false, '2026-09-12T08:00:00Z', '2026-09-12T08:00:00Z'
        )
      `);
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");

    await withTransaction(harness.appPool, "tenant-b", async (client) => {
      const setting = await client.query("select current_setting('app.tenant_id', true) as tenant_id");
      expect(setting.rows[0].tenant_id).toBe("tenant-b");
      const rows = await client.query("select id from public.erp_cash_accounts");
      expect(rows.rows.map((row) => row.id)).toEqual(["cash-b"]);
      const leaked = await client.query("select id from public.erp_cash_accounts where id = 'cash-rollback'");
      expect(leaked.rowCount).toBe(0);
    });

    const owner = await harness.ownerPool.connect();
    try {
      const leftover = await owner.query("select id from public.erp_cash_accounts where id = 'cash-rollback'");
      expect(leftover.rowCount).toBe(0);
    } finally {
      owner.release();
    }
    expect(seen).toEqual(["tenant-a"]);
  });
});

async function withSavepoint<T>(client: PoolClient, action: () => Promise<T>): Promise<T> {
  await client.query("savepoint dealtwin_case");
  try {
    const value = await action();
    await client.query("release savepoint dealtwin_case");
    return value;
  } catch (error) {
    await client.query("rollback to savepoint dealtwin_case");
    throw error;
  }
}

function canonicalProof(): DealProofDto {
  const result = buildDealProof(proofInput());
  if (!result.ok) throw new Error(result.error.message);
  return encodeProof(result.value);
}

function proofInput(overrides: Partial<ProofBuildInput> = {}): ProofBuildInput {
  const scenario = createJudgeFixture();
  const version = createDealVersion({
    id: "version-a",
    dealId: "deal-a",
    version: 1,
    terms: scenario.candidateTermsA,
    createdBy: "actor-a",
    createdAt: GENERATED_AT,
  });
  const baseResult = compileDeal({
    snapshot: scenario.snapshot,
    terms: scenario.candidateTermsA,
    constraints: scenario.constraints,
    policy: scenario.policy,
    approvedApprovalCodes: [],
  });
  return {
    proofId: "proof-a",
    dealId: "deal-a",
    version,
    snapshot: scenario.snapshot,
    constraints: scenario.constraints,
    policy: scenario.policy,
    baseResult,
    stressRuns: [{
      id: "stress-delay-receipt",
      transformType: "delay_specified_receipt",
      parameters: { days: 3, eventId: "receivable:judge-existing-so" },
      inputPayload: { eventId: "receivable:judge-existing-so", days: 3 },
      resultPayload: { outcome: "CONDITIONALLY_VALID", minimumProjectedBalanceRupiah: "5000000" },
    }],
    assumptions: [{ id: "assumption-horizon", code: "explicit_horizon", detail: "Requested horizon is 30 days from as-of." }],
    approvals: [{ id: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization", status: "pending" }],
    approvedApprovalCodes: [],
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

async function seedIsolationFixtures(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await seedTenant(client, "tenant-a");
    await seedTenant(client, "tenant-b");
    await seedTenant(client, JUDGE_TENANT_ID);
    await insertCashAccount(client, "tenant-a", "cash-a", "Cash A");
    await insertCashAccount(client, "tenant-b", "cash-b", "Cash B");
    await insertCashAccount(client, JUDGE_TENANT_ID, "judge-cash", "Judge Cash");
    await seedProofGraph(client, "tenant-a");
  } finally {
    client.release();
  }
}

async function seedTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("insert into public.erp_tenants (id, name) values ($1, $2) on conflict do nothing", [tenantId, tenantId]);
  await client.query(
    "insert into public.erp_workspaces (tenant_id, revision, active_role) values ($1, 0, 'admin') on conflict do nothing",
    [tenantId],
  );
  await client.query(`
    insert into public.erp_customers (
      tenant_id, id, code, name, contact_name, phone, email, address, credit_limit, active, created_at, updated_at
    ) values (
      $1, 'customer-a', 'CUST-A', 'Customer A', 'Contact', '0', 'a@example.com', 'Addr', 0, true,
      '2026-09-12T08:00:00Z', '2026-09-12T08:00:00Z'
    ) on conflict do nothing
  `, [tenantId]);
}

async function insertCashAccount(client: PoolClient, tenantId: string, id: string, name: string): Promise<void> {
  await client.query(`
    insert into public.erp_cash_accounts (
      tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
      opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
    ) values (
      $1, $2, $3, $4, 'IDR', 9007199254740993, '2026-09-12',
      'opening_balance', $5, '1', true, '2026-09-12T08:00:00Z', '2026-09-12T08:00:00Z'
    ) on conflict do nothing
  `, [tenantId, id, `CODE-${id}`, name, `opening-${id}`]);
}

async function seedProofGraph(client: PoolClient, tenantId: string): Promise<void> {
  await client.query(`
    insert into public.dealtwin_deals (
      tenant_id, id, title, customer_id, status, current_version_id, committed_sales_order_id, created_at, updated_at
    ) values (
      $1, 'deal-a', 'Deal A', 'customer-a', 'PROOF_GENERATED', null, null, '2026-09-16T08:00:00Z', '2026-09-16T08:00:00Z'
    ) on conflict do nothing
  `, [tenantId]);
  await client.query(`
    insert into public.dealtwin_deal_versions (
      tenant_id, id, deal_id, version, terms, terms_hash, created_by, created_at
    ) values (
      $1, 'version-a', 'deal-a', 1, '{}'::jsonb, $2, 'actor-a', '2026-09-16T08:00:00Z'
    ) on conflict do nothing
  `, [tenantId, HASH]);
  await client.query(`
    update public.dealtwin_deals
    set current_version_id = 'version-a'
    where tenant_id = $1 and id = 'deal-a'
  `, [tenantId]);
  await client.query(`
    insert into public.dealtwin_erp_snapshots (
      tenant_id, id, erp_revision, as_of_date, requested_horizon_end, adapter_version,
      dependency_keys, dependency_manifest, canonical_events, state_hash, created_at
    ) values (
      $1, 'snapshot-a', 1, '2026-09-12', '2026-10-12', 'dealtwin-erp-adapter-v1',
      '{}', '{}'::jsonb, '[]'::jsonb, $2, '2026-09-16T08:00:00Z'
    ) on conflict do nothing
  `, [tenantId, HASH]);
  await client.query(`
    insert into public.dealtwin_compile_runs (
      tenant_id, id, deal_version_id, snapshot_id, kind, engine_version, input_hash, result_hash,
      outcome, cash_floor_rupiah, shortfall_rupiah, worst_minimum_rupiah, first_violation_date,
      violation_data, parent_run_id, created_at
    ) values (
      $1, 'compile-a', 'version-a', 'snapshot-a', 'base', 'dealtwin-engine-v1', $2, $2,
      'CONDITIONALLY_VALID', 5000000, 3000000, 2000000, '2026-09-22',
      '{}'::jsonb, null, '2026-09-16T08:00:00Z'
    ) on conflict do nothing
  `, [tenantId, HASH]);
  await client.query(`
    insert into public.dealtwin_proofs (
      tenant_id, id, compile_run_id, deal_id, deal_version_id, proof_hash, result_hash, input_hash,
      status, stale_reason, dependency_keys, proof_json, generated_at, replayed_at, created_at, updated_at
    ) values (
      $1, 'proof-a', 'compile-a', 'deal-a', 'version-a', $2, $2, $2,
      'CONDITIONALLY_VALID', null, '{}', '{}'::jsonb, '2026-09-16T08:00:00Z', null,
      '2026-09-16T08:00:00Z', '2026-09-16T08:00:00Z'
    ) on conflict do nothing
  `, [tenantId, HASH]);
}
