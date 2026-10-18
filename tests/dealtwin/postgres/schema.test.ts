import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";

import { applyTestMigrations, PostgresHarness, requiredTestDatabaseUrl } from "./harness";

const CASH_TABLES = ["erp_cash_accounts", "erp_cash_movements"] as const;
const DEAL_TWIN_TABLES = [
  "dealtwin_deals",
  "dealtwin_deal_versions",
  "dealtwin_constraints",
  "dealtwin_erp_snapshots",
  "dealtwin_compile_runs",
  "dealtwin_proofs",
  "dealtwin_approvals",
  "dealtwin_liquidity_commitments",
] as const;

let harness: PostgresHarness;

async function ownerQuery<T extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = await harness.ownerPool.connect();
  try {
    const result = await client.query<T>(sql, values);
    return result.rows;
  } finally {
    client.release();
  }
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await ownerQuery<{ exists: boolean }>(
    "select exists(select 1 from pg_tables where schemaname = 'public' and tablename = $1) as exists",
    [table],
  );
  return rows[0]?.exists === true;
}

async function columns(table: string): Promise<Map<string, { udt: string; nullable: string }>> {
  const rows = await ownerQuery<{ column_name: string; udt_name: string; is_nullable: string }>(
    `select column_name, udt_name, is_nullable
     from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return new Map(rows.map((row) => [row.column_name, { udt: row.udt_name, nullable: row.is_nullable }]));
}

async function constraintDefs(table: string): Promise<string[]> {
  const rows = await ownerQuery<{ definition: string }>(
    `select pg_get_constraintdef(c.oid) as definition
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = $1`,
    [table],
  );
  return rows.map((row) => row.definition.toLowerCase());
}

async function indexDefs(table: string): Promise<string[]> {
  const rows = await ownerQuery<{ indexdef: string }>(
    "select indexdef from pg_indexes where schemaname = 'public' and tablename = $1",
    [table],
  );
  return rows.map((row) => row.indexdef.toLowerCase());
}

async function rlsFlags(table: string): Promise<{ enabled: boolean; forced: boolean }> {
  const rows = await ownerQuery<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `select c.relrowsecurity, c.relforcerowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = $1`,
    [table],
  );
  return { enabled: rows[0]?.relrowsecurity === true, forced: rows[0]?.relforcerowsecurity === true };
}

describe("DealTwin PostgreSQL schema", () => {
  beforeAll(async () => {
    harness = await PostgresHarness.connect(requiredTestDatabaseUrl());
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("refuses a remote URL before any SQL", async () => {
    await expect(applyTestMigrations("postgres://dealtwin:dealtwin@db.supabase.co:5432/postgres"))
      .rejects.toThrow(/local\/test PostgreSQL host/);
    await expect(applyTestMigrations("postgres://dealtwin:dealtwin@127.0.0.1:55432/production"))
      .rejects.toThrow(/dealtwin_test/);
  });

  it("creates the cash tables and eight DealTwin tables", async () => {
    for (const table of [...CASH_TABLES, ...DEAL_TWIN_TABLES]) {
      expect(await tableExists(table), table).toBe(true);
    }
    expect(await tableExists("dealtwin_conflicts")).toBe(false);
    expect(await tableExists("dealtwin_audit_events")).toBe(false);
  });

  it("stores cash money as bigint with one active IDR account per tenant", async () => {
    const accounts = await columns("erp_cash_accounts");
    expect(accounts.get("opening_balance_rupiah")).toMatchObject({ udt: "int8", nullable: "NO" });
    expect(accounts.get("opening_balance_date")).toMatchObject({ udt: "date", nullable: "NO" });
    expect(accounts.get("tenant_id")?.nullable).toBe("NO");
    const indexes = await indexDefs("erp_cash_accounts");
    expect(indexes.some((definition) => (
      definition.includes("unique")
      && definition.includes("tenant_id")
      && definition.includes("active")
      && definition.includes("idr")
    ))).toBe(true);
  });

  it("stores append-only cash movements with original/reversal constraints", async () => {
    const movements = await columns("erp_cash_movements");
    expect(movements.get("amount_rupiah")).toMatchObject({ udt: "int8", nullable: "NO" });
    expect(movements.get("effective_date")).toMatchObject({ udt: "date", nullable: "NO" });
    expect(movements.get("same_day_order")?.udt).toMatch(/int/);
    const defs = (await constraintDefs("erp_cash_movements")).join("\n");
    expect(defs).toContain("entry_kind");
    expect(defs).toContain("original");
    expect(defs).toContain("reversal");
    expect(defs).toMatch(/foreign key \(tenant_id, account_id\)/);
    expect(defs).toMatch(/foreign key \(tenant_id, reverses_movement_id/);
    const indexes = await indexDefs("erp_cash_movements");
    expect(indexes.some((definition) => definition.includes("unique") && definition.includes("reverses_movement_id"))).toBe(true);
    expect(indexes.some((definition) => (
      definition.includes("unique") && definition.includes("source_type") && definition.includes("source_id")
    ))).toBe(true);
  });

  it("rejects a second active IDR account and an invalid reversal through the database", async () => {
    const client = await harness.ownerPool.connect();
    try {
      await seedTenants(client);
      await client.query(`
        insert into public.erp_cash_accounts (
          tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
          opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
        ) values (
          'tenant-a', 'cash-a', 'BANK-IDR', 'Primary', 'IDR', 30000000, '2026-09-12',
          'opening_balance', 'opening-a', '1', true, '2026-09-12T08:00:00Z', '2026-09-12T08:00:00Z'
        )
      `);
      await expect(client.query(`
        insert into public.erp_cash_accounts (
          tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
          opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
        ) values (
          'tenant-a', 'cash-a-2', 'BANK-IDR-2', 'Second', 'IDR', 1, '2026-09-12',
          'opening_balance', 'opening-b', '1', true, '2026-09-12T08:00:00Z', '2026-09-12T08:00:00Z'
        )
      `)).rejects.toThrow();

      await client.query(`
        insert into public.erp_cash_movements (
          tenant_id, id, account_id, effective_date, same_day_order, direction, amount_rupiah,
          entry_kind, reverses_movement_id, source_type, source_id, source_revision,
          actor_role, actor_id, reason, created_at, updated_at
        ) values (
          'tenant-a', 'move-1', 'cash-a', '2026-09-13', 100, 'outflow', 1000000,
          'original', null, 'manual_cash', 'manual-1', '1',
          'finance', 'finance-a', 'verified', '2026-09-13T08:00:00Z', '2026-09-13T08:00:00Z'
        )
      `);
      await expect(client.query(`
        insert into public.erp_cash_movements (
          tenant_id, id, account_id, effective_date, same_day_order, direction, amount_rupiah,
          entry_kind, reverses_movement_id, source_type, source_id, source_revision,
          actor_role, actor_id, reason, created_at, updated_at
        ) values (
          'tenant-a', 'move-1-rev', 'cash-a', '2026-09-13', 101, 'outflow', 1000000,
          'reversal', 'move-1', 'cash_movement_reversal', 'move-1', '1',
          'finance', 'finance-a', 'bad same direction', '2026-09-13T08:00:00Z', '2026-09-13T08:00:00Z'
        )
      `)).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("uses tenant-composite foreign keys, jsonb payloads, text-array keys, and timestamptz", async () => {
    const proofs = await columns("dealtwin_proofs");
    expect(proofs.get("proof_json")?.udt).toBe("jsonb");
    expect(proofs.get("dependency_keys")?.udt).toBe("_text");
    expect(proofs.get("generated_at")?.udt).toBe("timestamptz");
    expect(proofs.get("tenant_id")?.nullable).toBe("NO");
    const versions = await columns("dealtwin_deal_versions");
    expect(versions.get("terms")?.udt).toBe("jsonb");
    expect(versions.get("version")?.udt).toBe("int8");
    const commitments = await columns("dealtwin_liquidity_commitments");
    expect(commitments.get("canonical_events")?.udt).toBe("jsonb");
    expect(commitments.get("amount_rupiah")?.udt).toBe("int8");
    const compileRuns = await columns("dealtwin_compile_runs");
    expect(compileRuns.get("kind")?.nullable).toBe("NO");

    const dealDefs = (await constraintDefs("dealtwin_deals")).join("\n");
    expect(dealDefs).toMatch(/foreign key \(tenant_id, customer_id\)/);
    expect(dealDefs).toMatch(/foreign key \(tenant_id, id, current_version_id\)/);
    const proofDefs = (await constraintDefs("dealtwin_proofs")).join("\n");
    expect(proofDefs).toMatch(/foreign key \(tenant_id, compile_run_id\)/);
    const approvalDefs = (await constraintDefs("dealtwin_approvals")).join("\n");
    expect(approvalDefs).toMatch(/foreign key \(tenant_id, proof_id\)/);
    const commitmentDefs = (await constraintDefs("dealtwin_liquidity_commitments")).join("\n");
    expect(commitmentDefs).toMatch(/foreign key \(tenant_id, proof_id\)/);
    expect(commitmentDefs).toMatch(/foreign key \(tenant_id, account_id\)/);
  });

  it("rejects a deal current_version_id that belongs to another same-tenant deal", async () => {
    const client = await harness.ownerPool.connect();
    const hash = "a".repeat(64);
    const stamp = "2026-09-16T08:00:00Z";
    try {
      await seedTenants(client);
      await client.query(`
        insert into public.erp_customers (
          tenant_id, id, code, name, contact_name, phone, email, address, credit_limit, active, created_at, updated_at
        ) values (
          'tenant-a', 'customer-a', 'CUST-A', 'Customer A', 'Contact', '0', 'a@example.com', 'Addr', 0, true, $1, $1
        ) on conflict do nothing
      `, [stamp]);
      await client.query(`
        insert into public.dealtwin_deals (
          tenant_id, id, title, customer_id, status, current_version_id, committed_sales_order_id, created_at, updated_at
        ) values
          ('tenant-a', 'deal-a', 'Deal A', 'customer-a', 'DRAFT', null, null, $1, $1),
          ('tenant-a', 'deal-b', 'Deal B', 'customer-a', 'DRAFT', null, null, $1, $1)
        on conflict do nothing
      `, [stamp]);
      await client.query(`
        insert into public.dealtwin_deal_versions (
          tenant_id, id, deal_id, version, terms, terms_hash, created_by, created_at
        ) values
          ('tenant-a', 'version-a', 'deal-a', 1, '{}'::jsonb, $1, 'actor', $2),
          ('tenant-a', 'version-b', 'deal-b', 1, '{}'::jsonb, $1, 'actor', $2)
        on conflict do nothing
      `, [hash, stamp]);
      await client.query(`
        update public.dealtwin_deals
        set current_version_id = 'version-a'
        where tenant_id = 'tenant-a' and id = 'deal-a'
      `);
      await expect(client.query(`
        update public.dealtwin_deals
        set current_version_id = 'version-b'
        where tenant_id = 'tenant-a' and id = 'deal-a'
      `)).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("indexes foreign keys and uses separate partial unique lifecycle idempotency indexes", async () => {
    const commitmentIndexes = await indexDefs("dealtwin_liquidity_commitments");
    expect(commitmentIndexes.some((definition) => definition.includes("proof_id") && definition.includes("deal_version_id") && definition.includes("canonical_event_hash") && definition.includes("unique"))).toBe(true);
    expect(commitmentIndexes.some((definition) => definition.includes("reserve_idempotency_key") && definition.includes("unique"))).toBe(true);
    expect(commitmentIndexes.some((definition) => definition.includes("commit_idempotency_key") && definition.includes("unique"))).toBe(true);
    expect(commitmentIndexes.some((definition) => definition.includes("release_idempotency_key") && definition.includes("unique"))).toBe(true);
    const proofIndexes = await indexDefs("dealtwin_proofs");
    expect(proofIndexes.some((definition) => definition.includes("compile_run_id"))).toBe(true);
  });

  it("uniquely indexes successful DealTwin operation receipts on erp_audit_events", async () => {
    const indexes = await indexDefs("erp_audit_events");
    expect(indexes.some((definition) => (
      definition.includes("unique")
      && definition.includes("tenant_id")
      && definition.includes("action")
      && definition.includes("idempotencykey")
      && definition.includes("dealtwin.%")
      && definition.includes("operationsucceeded")
    ))).toBe(true);
    const defs = (await constraintDefs("erp_audit_events")).join("\n");
    expect(defs).toMatch(/operationsucceeded/);
  });

  it("forces RLS on participating ERP and DealTwin tables", async () => {
    for (const table of ["erp_tenants", "erp_workspaces", "erp_audit_events", ...CASH_TABLES, ...DEAL_TWIN_TABLES]) {
      expect(await rlsFlags(table), table).toEqual({ enabled: true, forced: true });
    }
  });

  it("does not grant the application role DELETE or audit UPDATE", async () => {
    const rows = await ownerQuery<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type
       from information_schema.table_privileges
       where grantee = 'dealtwin_app' and table_schema = 'public'
         and table_name in ('erp_cash_movements', 'erp_audit_events', 'dealtwin_proofs')`,
    );
    expect(rows.some((row) => row.privilege_type === "DELETE")).toBe(false);
    expect(rows.some((row) => row.table_name === "erp_audit_events" && row.privilege_type === "UPDATE")).toBe(false);
    expect(rows.some((row) => row.table_name === "erp_cash_movements" && row.privilege_type === "UPDATE")).toBe(false);
    expect(rows.some((row) => row.table_name === "dealtwin_proofs" && row.privilege_type === "SELECT")).toBe(true);
  });
});

async function seedTenants(client: PoolClient): Promise<void> {
  await client.query("insert into public.erp_tenants (id, name) values ('tenant-a', 'A'), ('tenant-b', 'B') on conflict do nothing");
  await client.query(`
    insert into public.erp_workspaces (tenant_id, revision, active_role)
    values ('tenant-a', 0, 'admin'), ('tenant-b', 0, 'admin')
    on conflict do nothing
  `);
}
