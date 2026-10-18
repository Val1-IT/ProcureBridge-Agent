import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

import {
  assertDisposableJudgeDatabaseUrl,
  DEALTWIN_TEST_DATABASE_URL,
} from "../../../lib/server/postgres/config";

export const DEAL_TWIN_APP_ROLE = "dealtwin_app";
export const DEAL_TWIN_RESET_ROLE = "dealtwin_judge_reset";
export const DEAL_TWIN_APP_LOGIN_ROLE = "dealtwin_app_login";
export const DEAL_TWIN_RESET_LOGIN_ROLE = "dealtwin_reset_login";
export const JUDGE_TENANT_ID = "dealtwin-judge-v1";

const APP_LOGIN_PASSWORD = "dealtwin_app_login";
const RESET_LOGIN_PASSWORD = "dealtwin_reset_login";
const REQUIRED_DATABASE = "dealtwin_test";
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");

const COMPAT_ROLES = ["anon", "authenticated", "service_role"] as const;

export interface TenantAccessActionOutcome {
  readonly action: string;
  readonly allowed: boolean;
}

export interface TenantAccessEvidence {
  readonly role: string;
  readonly tenantId: string;
  readonly outcomes: readonly TenantAccessActionOutcome[];
}

export function requiredTestDatabaseUrl(): string {
  const databaseUrl = process.env.DEALTWIN_TEST_DATABASE_URL;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    throw new Error("DEALTWIN_TEST_DATABASE_URL is required for DealTwin PostgreSQL integration tests.");
  }
  assertDisposableTestDatabaseUrl(databaseUrl);
  return databaseUrl;
}

export function assertDisposableTestDatabaseUrl(databaseUrl: string): void {
  assertDisposableJudgeDatabaseUrl(databaseUrl);
}

function parseLocalUrl(databaseUrl: string): URL {
  assertDisposableTestDatabaseUrl(databaseUrl);
  return new URL(databaseUrl);
}

function createLocalPool(databaseUrl: string, user: string, password: string): Pool {
  const parsed = parseLocalUrl(databaseUrl);
  return new Pool({
    host: parsed.hostname.replace(/^\[|\]$/g, ""),
    port: parsed.port === "" ? 5432 : Number(parsed.port),
    user,
    password,
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

async function withOwnerClient<T>(databaseUrl: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const parsed = parseLocalUrl(databaseUrl);
  const pool = createLocalPool(
    databaseUrl,
    decodeURIComponent(parsed.username),
    decodeURIComponent(parsed.password),
  );
  const client = await pool.connect();
  try {
    return await action(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function ensureCompatibilityRoles(client: PoolClient): Promise<void> {
  for (const role of COMPAT_ROLES) {
    await client.query(`
      do $role$
      begin
        if not exists (select 1 from pg_roles where rolname = '${role}') then
          create role ${role} nologin nosuperuser nobypassrls;
        end if;
      end
      $role$;
    `);
  }
}

async function provisionLoginRoles(client: PoolClient): Promise<void> {
  await client.query(`
    do $login$
    begin
      if not exists (select 1 from pg_roles where rolname = '${DEAL_TWIN_APP_LOGIN_ROLE}') then
        create role ${DEAL_TWIN_APP_LOGIN_ROLE} login nosuperuser nobypassrls inherit password '${APP_LOGIN_PASSWORD}';
      end if;
      if not exists (select 1 from pg_roles where rolname = '${DEAL_TWIN_RESET_LOGIN_ROLE}') then
        create role ${DEAL_TWIN_RESET_LOGIN_ROLE} login nosuperuser nobypassrls inherit password '${RESET_LOGIN_PASSWORD}';
      end if;
    end
    $login$;
  `);
  await client.query(`grant ${DEAL_TWIN_APP_ROLE} to ${DEAL_TWIN_APP_LOGIN_ROLE}`);
  await client.query(`grant ${DEAL_TWIN_RESET_ROLE} to ${DEAL_TWIN_RESET_LOGIN_ROLE}`);
  await client.query(`grant connect on database ${REQUIRED_DATABASE} to ${DEAL_TWIN_APP_LOGIN_ROLE}, ${DEAL_TWIN_RESET_LOGIN_ROLE}`);
  await client.query(`grant usage on schema public to ${DEAL_TWIN_APP_ROLE}, ${DEAL_TWIN_RESET_ROLE}, ${DEAL_TWIN_APP_LOGIN_ROLE}, ${DEAL_TWIN_RESET_LOGIN_ROLE}`);
}

async function applyMigrationFiles(client: PoolClient): Promise<void> {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) {
    const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    if (sql.trim().length === 0) continue;
    await client.query(sql);
  }
}

export async function applyTestMigrations(databaseUrl: string): Promise<void> {
  assertDisposableTestDatabaseUrl(databaseUrl);
  await withOwnerClient(databaseUrl, async (client) => {
    await client.query("begin");
    try {
      await ensureCompatibilityRoles(client);
      await applyMigrationFiles(client);
      const installed = await client.query<{ rolname: string }>(
        "select rolname from pg_roles where rolname = any($1::text[])",
        [[DEAL_TWIN_APP_ROLE, DEAL_TWIN_RESET_ROLE]],
      );
      if (installed.rows.length === 2) {
        await provisionLoginRoles(client);
      } else if (installed.rows.length > 0) {
        throw new Error("DealTwin application and reset roles must be created together.");
      }
      await client.query("commit");
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original migration error.
      }
      throw error;
    }
  });
}

async function tryAction(client: PoolClient, action: string, sql: string, values: unknown[] = []): Promise<TenantAccessActionOutcome> {
  await client.query("savepoint probe_action");
  try {
    const result = await client.query(sql, values);
    await client.query("release savepoint probe_action");
    if (action === "select" || action === "update_other" || action === "delete") {
      return { action, allowed: (result.rowCount ?? 0) > 0 };
    }
    return { action, allowed: true };
  } catch {
    await client.query("rollback to savepoint probe_action");
    return { action, allowed: false };
  }
}

export async function probeTenantAccess(
  databaseUrl: string,
  role: string,
  tenantId: string,
): Promise<TenantAccessEvidence> {
  assertDisposableTestDatabaseUrl(databaseUrl);
  if (role !== DEAL_TWIN_APP_ROLE && role !== DEAL_TWIN_RESET_ROLE) {
    throw new Error("probeTenantAccess role must be dealtwin_app or dealtwin_judge_reset.");
  }
  const user = role === DEAL_TWIN_APP_ROLE ? DEAL_TWIN_APP_LOGIN_ROLE : DEAL_TWIN_RESET_LOGIN_ROLE;
  const password = role === DEAL_TWIN_APP_ROLE ? APP_LOGIN_PASSWORD : RESET_LOGIN_PASSWORD;
  const pool = createLocalPool(databaseUrl, user, password);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const ownAccountId = `probe-own-${role}`;
    const otherTenantId = tenantId === "tenant-b" ? "tenant-a" : "tenant-b";
    const stamp = "2026-09-12T08:00:00Z";
    const accountInsert = `
      insert into public.erp_cash_accounts (
        tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
        opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
      ) values ($1, $2, $2, $2, 'IDR', 1, '2026-09-12', 'opening_balance', $2, '1', false, '${stamp}', '${stamp}')
    `;
    const outcomes = [
      await tryAction(client, "select", "select id from public.erp_tenants"),
      await tryAction(client, "insert_own", accountInsert, [tenantId, ownAccountId]),
      await tryAction(client, "insert_other", accountInsert, [otherTenantId, `probe-other-${role}`]),
      await tryAction(client, "update_other", "update public.erp_cash_accounts set name = 'hijacked' where tenant_id = $1", [otherTenantId]),
      await tryAction(client, "delete", "delete from public.erp_cash_accounts where tenant_id = $1", [tenantId]),
    ];
    await client.query("rollback");
    return { role, tenantId, outcomes };
  } finally {
    client.release();
    await pool.end();
  }
}

export class PostgresHarness {
  private constructor(
    readonly databaseUrl: string,
    readonly ownerPool: Pool,
    readonly appPool: Pool,
    readonly resetPool: Pool,
  ) {}

  static async connect(databaseUrl: string = requiredTestDatabaseUrl()): Promise<PostgresHarness> {
    assertDisposableTestDatabaseUrl(databaseUrl);
    const parsed = parseLocalUrl(databaseUrl);
    const ownerPool = createLocalPool(
      databaseUrl,
      decodeURIComponent(parsed.username),
      decodeURIComponent(parsed.password),
    );
    const appPool = createLocalPool(databaseUrl, DEAL_TWIN_APP_LOGIN_ROLE, APP_LOGIN_PASSWORD);
    const resetPool = createLocalPool(databaseUrl, DEAL_TWIN_RESET_LOGIN_ROLE, RESET_LOGIN_PASSWORD);
    const harness = new PostgresHarness(databaseUrl, ownerPool, appPool, resetPool);
    await harness.resetAndMigrate();
    return harness;
  }

  async resetAndMigrate(): Promise<void> {
    assertDisposableTestDatabaseUrl(this.databaseUrl);
    const client = await this.ownerPool.connect();
    try {
      const database = await client.query<{ current_database: string; version: string }>(
        "select current_database(), version()",
      );
      if (database.rows[0]?.current_database !== REQUIRED_DATABASE) {
        throw new Error("Refusing to reset a database that is not dealtwin_test.");
      }
      await client.query("drop schema if exists public cascade");
      await client.query("create schema public");
      await client.query("grant usage on schema public to public");
    } finally {
      client.release();
    }
    await applyTestMigrations(this.databaseUrl);
  }

  async close(): Promise<void> {
    await Promise.all([this.ownerPool.end(), this.appPool.end(), this.resetPool.end()]);
  }
}

export const DEFAULT_TEST_DATABASE_URL = DEALTWIN_TEST_DATABASE_URL;
