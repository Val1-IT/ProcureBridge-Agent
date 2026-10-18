import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import {
  assertLocalTestDatabaseUrl,
  DEALTWIN_TEST_DATABASE_URL,
  parsePostgresConfig,
} from "../../../lib/server/postgres/config";
import { createPostgresPool } from "../../../lib/server/postgres/pool";
import { withPostgresClient, withTransaction } from "../../../lib/server/postgres/transaction";

const TENANT_ID = "dealtwin-judge-v1";
const WORKSPACE_LOCK_SQL = "select revision from public.erp_workspaces where tenant_id = $1 for update";

interface QueryCall {
  readonly text: string;
  readonly values: unknown[] | undefined;
}

interface FakeClient extends PoolClient {
  readonly id: number;
  readonly queries: QueryCall[];
  released: boolean;
  releaseCount: number;
  localSettings: Map<string, string>;
  sessionSettings: Map<string, string>;
}

interface FakePool {
  readonly pool: Pool;
  readonly poolQueryCount: { value: number };
  readonly connectCount: { value: number };
  client(index?: number): FakeClient;
}

function createFakePool(options: {
  readonly recycle?: boolean;
  readonly failOn?: Readonly<Record<string, Error>>;
} = {}): FakePool {
  const poolQueryCount = { value: 0 };
  const connectCount = { value: 0 };
  const clients: FakeClient[] = [];
  let recycled: FakeClient | undefined;

  const pool = {
    async connect() {
      if (options.recycle && recycled?.released) {
        recycled.released = false;
        connectCount.value += 1;
        return recycled;
      }
      connectCount.value += 1;
      const localSettings = new Map<string, string>();
      const sessionSettings = new Map<string, string>();
      const queries: QueryCall[] = [];
      const failOn = options.failOn ?? {};
      const client = {
        id: connectCount.value,
        queries,
        released: false,
        releaseCount: 0,
        localSettings,
        sessionSettings,
        async query(text: string | { text: string; values?: unknown[] }, values?: unknown[]) {
          const sql = typeof text === "string" ? text : text.text;
          const params = typeof text === "string" ? values : text.values;
          queries.push({ text: sql, values: params });
          const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
          const failure = failOn[normalized] ?? failOn[sql];
          if (failure) throw failure;
          if (normalized === "begin") return { rows: [], rowCount: 0 };
          if (normalized === "commit" || normalized === "rollback") {
            localSettings.clear();
            return { rows: [], rowCount: 0 };
          }
          if (normalized.startsWith("select set_config")) {
            const key = String(params?.[0] ?? "");
            const value = String(params?.[1] ?? "");
            if (params?.[2] === true) localSettings.set(key, value);
            else sessionSettings.set(key, value);
            return { rows: [{ set_config: value }], rowCount: 1 };
          }
          if (normalized.startsWith("set local ")) return { rows: [], rowCount: 0 };
          if (normalized.startsWith("set ") && !normalized.startsWith("set local ")) {
            sessionSettings.set(normalized, sql);
            return { rows: [], rowCount: 0 };
          }
          if (normalized.startsWith("reset ")) {
            sessionSettings.clear();
            return { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        },
        release() {
          client.released = true;
          client.releaseCount += 1;
        },
      } as FakeClient;
      recycled = client;
      clients.push(client);
      return client;
    },
    async query() {
      poolQueryCount.value += 1;
      throw new Error("pool.query is forbidden inside DealTwin transactions.");
    },
  };

  return {
    pool: pool as unknown as Pool,
    poolQueryCount,
    connectCount,
    client(index = 0) {
      const value = clients[index];
      if (!value) throw new Error("No client was checked out.");
      return value;
    },
  };
}

function sqlTexts(client: FakeClient): string[] {
  return client.queries.map((item) => item.text.replace(/\s+/g, " ").trim().toLowerCase());
}

describe("parsePostgresConfig", () => {
  it("requires explicit disable or verify-full SSL and never enables insecure certificate mode", () => {
    expect(parsePostgresConfig({
      DATABASE_URL: DEALTWIN_TEST_DATABASE_URL,
      DATABASE_SSL_MODE: "disable",
    })).toMatchObject({
      connectionString: DEALTWIN_TEST_DATABASE_URL,
      sslMode: "disable",
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statementTimeoutMillis: 5000,
    });
    expect(parsePostgresConfig({
      DATABASE_URL: DEALTWIN_TEST_DATABASE_URL,
      DATABASE_SSL_MODE: "verify-full",
    })).toMatchObject({
      sslMode: "verify-full",
      ssl: { rejectUnauthorized: true },
    });
    expect(() => parsePostgresConfig({
      DATABASE_URL: DEALTWIN_TEST_DATABASE_URL,
      DATABASE_SSL_MODE: "no-verify",
    })).toThrow(/DATABASE_SSL_MODE/);
    expect(() => parsePostgresConfig({
      DATABASE_URL: DEALTWIN_TEST_DATABASE_URL,
      DATABASE_SSL_MODE: "require",
    })).toThrow(/DATABASE_SSL_MODE/);
    expect(() => parsePostgresConfig({
      DATABASE_URL: DEALTWIN_TEST_DATABASE_URL,
    })).toThrow(/DATABASE_SSL_MODE/);
  });

  it("rejects URL-level SSL options so they cannot downgrade DATABASE_SSL_MODE", () => {
    expect(() => parsePostgresConfig({
      DATABASE_URL: `${DEALTWIN_TEST_DATABASE_URL}?sslmode=disable`,
      DATABASE_SSL_MODE: "verify-full",
    })).toThrow(/DATABASE_SSL_MODE/);
    expect(() => parsePostgresConfig({
      DATABASE_URL: `${DEALTWIN_TEST_DATABASE_URL}?sslmode=no-verify`,
      DATABASE_SSL_MODE: "verify-full",
    })).toThrow(/DATABASE_SSL_MODE/);
    const secret = "super-secret-ssl";
    expect(() => parsePostgresConfig({
      DATABASE_URL: `postgres://user:${secret}@db.example.com:5432/postgres?sslmode=disable`,
      DATABASE_SSL_MODE: "verify-full",
    })).not.toThrow(new RegExp(secret));
  });

  it("rejects remote or ambiguous test database URLs without printing secrets", () => {
    expect(() => assertLocalTestDatabaseUrl(DEALTWIN_TEST_DATABASE_URL)).not.toThrow();
    expect(() => assertLocalTestDatabaseUrl("postgres://dealtwin:dealtwin@localhost:55432/dealtwin_test")).not.toThrow();
    expect(() => assertLocalTestDatabaseUrl("postgres://dealtwin:dealtwin@[::1]:55432/dealtwin_test")).not.toThrow();
    expect(() => assertLocalTestDatabaseUrl("postgres://user:super-secret@db.supabase.co:5432/postgres"))
      .toThrow(/local\/test PostgreSQL/);
    expect(() => assertLocalTestDatabaseUrl("postgres://user:super-secret@db.supabase.co:5432/postgres"))
      .not.toThrow(/super-secret/);
    expect(() => assertLocalTestDatabaseUrl("postgres://dealtwin:dealtwin@localhost.example.com:55432/dealtwin_test"))
      .toThrow(/local\/test PostgreSQL/);
    expect(() => assertLocalTestDatabaseUrl("postgres://localhost@evil.example:5432/dealtwin_test"))
      .toThrow(/local\/test PostgreSQL/);
    expect(() => assertLocalTestDatabaseUrl("postgres://dealtwin:dealtwin@127.0.0.1:55432/localhost"))
      .not.toThrow();
  });
});

describe("createPostgresPool", () => {
  it("creates a process pool with the locked checkout and timeout limits", async () => {
    const pool = createPostgresPool(parsePostgresConfig({
      DATABASE_URL: DEALTWIN_TEST_DATABASE_URL,
      DATABASE_SSL_MODE: "disable",
    }));
    try {
      expect(pool.options.max).toBe(10);
      expect(pool.options.idleTimeoutMillis).toBe(30000);
      expect(pool.options.connectionTimeoutMillis).toBe(5000);
      expect(pool.options.ssl).toBe(false);
      expect(pool.options.connectionString).toBeUndefined();
    } finally {
      await pool.end();
    }
  });

  it("keeps verify-full certificate checking when constructing the pool", async () => {
    const pool = createPostgresPool(parsePostgresConfig({
      DATABASE_URL: DEALTWIN_TEST_DATABASE_URL,
      DATABASE_SSL_MODE: "verify-full",
    }));
    try {
      expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
    } finally {
      await pool.end();
    }
  });
});

describe("withTransaction", () => {
  it("uses one checked-out client for BEGIN, tenant context, callback statements, and COMMIT", async () => {
    const fake = createFakePool();
    const result = await withTransaction(fake.pool, TENANT_ID, async (client) => {
      await client.query(WORKSPACE_LOCK_SQL, [TENANT_ID]);
      return "ok";
    });
    expect(result).toBe("ok");
    expect(fake.poolQueryCount.value).toBe(0);
    expect(fake.connectCount.value).toBe(1);
    const sql = sqlTexts(fake.client());
    expect(sql[0]).toBe("begin");
    expect(sql[1]).toMatch(/set local statement_timeout\s*=\s*5000/);
    expect(fake.client().queries[2]).toMatchObject({
      text: "select set_config('app.tenant_id', $1, true)",
      values: [TENANT_ID],
    });
    expect(sql).toContain(WORKSPACE_LOCK_SQL);
    expect(sql.at(-1)).toBe("commit");
    expect(fake.client().released).toBe(true);
    expect(fake.client().releaseCount).toBe(1);
    expect(fake.client().localSettings.size).toBe(0);
  });

  it("rolls back, clears tenant context, and still releases when the callback throws", async () => {
    const fake = createFakePool();
    await expect(withTransaction(fake.pool, TENANT_ID, async (client) => {
      await client.query(WORKSPACE_LOCK_SQL, [TENANT_ID]);
      throw new Error("forced-failure");
    })).rejects.toThrow("forced-failure");
    const sql = sqlTexts(fake.client());
    expect(sql[0]).toBe("begin");
    expect(sql).toContain("rollback");
    expect(sql).not.toContain("commit");
    expect(fake.poolQueryCount.value).toBe(0);
    expect(fake.client().released).toBe(true);
    expect(fake.client().releaseCount).toBe(1);
    expect(fake.client().localSettings.size).toBe(0);
  });

  it("does not claim SQL-text isolation; comments and literals are forwarded to the checked-out client", async () => {
    const fake = createFakePool();
    const quotedTenant = "tenant-'judge";
    const result = await withTransaction(fake.pool, quotedTenant, async (client) => {
      await client.query("select revision from public.erp_workspaces");
      await client.query("select revision from public.erp_workspaces -- tenant_id = $1");
      await client.query("select 'tenant_id = $1'");
      await client.query({ text: WORKSPACE_LOCK_SQL, values: [quotedTenant] });
      return "forwarded";
    });
    expect(result).toBe("forwarded");
    expect(fake.client().queries[2]).toMatchObject({
      text: "select set_config('app.tenant_id', $1, true)",
      values: [quotedTenant],
    });
    expect(sqlTexts(fake.client())).toContain(WORKSPACE_LOCK_SQL);
    expect(fake.client().released).toBe(true);
  });

  it("rejects nested transactions before a second checkout", async () => {
    const fake = createFakePool();
    await expect(withTransaction(fake.pool, TENANT_ID, async () => (
      withTransaction(fake.pool, TENANT_ID, async () => "nested")
    ))).rejects.toThrow(/nested/i);
    expect(fake.connectCount.value).toBe(1);
    expect(fake.client().released).toBe(true);
  });

  it("allows independent concurrent top-level transactions", async () => {
    const fake = createFakePool();
    const results = await Promise.all([
      withTransaction(fake.pool, TENANT_ID, async (client) => {
        await client.query(WORKSPACE_LOCK_SQL, [TENANT_ID]);
        return "a";
      }),
      withTransaction(fake.pool, TENANT_ID, async (client) => {
        await client.query(WORKSPACE_LOCK_SQL, [TENANT_ID]);
        return "b";
      }),
    ]);
    expect(results.sort()).toEqual(["a", "b"]);
    expect(fake.connectCount.value).toBe(2);
    expect(fake.client(0).id).not.toBe(fake.client(1).id);
    expect(fake.client(0).released).toBe(true);
    expect(fake.client(1).released).toBe(true);
  });

  it("fails closed on blank tenant identity before checkout work", async () => {
    const fake = createFakePool();
    await expect(withTransaction(fake.pool, " ", async () => "no")).rejects.toThrow(/tenant/i);
    await expect(withTransaction(fake.pool, "", async () => "no")).rejects.toThrow(/tenant/i);
    expect(fake.connectCount.value).toBe(0);
  });

  it("does not invoke the callback when BEGIN fails and still releases the client", async () => {
    const fake = createFakePool({ failOn: { begin: new Error("begin-failed") } });
    let invoked = false;
    await expect(withTransaction(fake.pool, TENANT_ID, async () => {
      invoked = true;
      return "no";
    })).rejects.toThrow("begin-failed");
    expect(invoked).toBe(false);
    expect(fake.client().released).toBe(true);
    expect(sqlTexts(fake.client())).not.toContain("rollback");
  });

  it("does not return the callback value when COMMIT fails and still releases", async () => {
    const fake = createFakePool({ failOn: { commit: new Error("commit-failed") } });
    await expect(withTransaction(fake.pool, TENANT_ID, async () => "ok")).rejects.toThrow("commit-failed");
    expect(fake.client().released).toBe(true);
    expect(fake.client().releaseCount).toBe(1);
    const sql = sqlTexts(fake.client());
    expect(sql).toContain("rollback");
    expect(sql.filter((item) => item === "commit")).toHaveLength(1);
  });

  it("preserves the callback error when ROLLBACK also fails", async () => {
    const fake = createFakePool({ failOn: { rollback: new Error("rollback-failed") } });
    await expect(withTransaction(fake.pool, TENANT_ID, async () => {
      throw new Error("forced-failure");
    })).rejects.toThrow("forced-failure");
    expect(fake.client().released).toBe(true);
  });

  it("releases after a synchronous callback throw", async () => {
    const fake = createFakePool();
    await expect(withTransaction(fake.pool, TENANT_ID, () => {
      throw new Error("sync-failure");
    })).rejects.toThrow("sync-failure");
    expect(fake.client().released).toBe(true);
    expect(sqlTexts(fake.client())).toContain("rollback");
  });
});

describe("withPostgresClient", () => {
  it("releases the client after success and after a thrown error", async () => {
    const success = createFakePool();
    await expect(withPostgresClient(success.pool, async (client) => {
      await client.query("select 1");
      return 1;
    })).resolves.toBe(1);
    expect(success.client().released).toBe(true);
    expect(success.poolQueryCount.value).toBe(0);

    const failure = createFakePool();
    await expect(withPostgresClient(failure.pool, async () => {
      throw new Error("client-failure");
    })).rejects.toThrow("client-failure");
    expect(failure.client().released).toBe(true);
    expect(failure.poolQueryCount.value).toBe(0);
  });

  it("does not mutate pooled session statement_timeout", async () => {
    const fake = createFakePool({ recycle: true });
    await withPostgresClient(fake.pool, async () => "ok");
    expect(sqlTexts(fake.client()).some((item) => item.startsWith("set ") && !item.startsWith("set local "))).toBe(false);
    expect(fake.client().sessionSettings.size).toBe(0);
    await withPostgresClient(fake.pool, async () => "ok");
    expect(fake.connectCount.value).toBe(2);
    expect(fake.client().sessionSettings.size).toBe(0);
    expect(fake.client().releaseCount).toBe(2);
  });
});

describe("docker-compose.dealtwin-test.yml", () => {
  it("documents the disposable local dealtwin_test PostgreSQL service", () => {
    const compose = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../docker-compose.dealtwin-test.yml"), "utf8");
    expect(compose).toContain("container_name: dealtwin_test");
    expect(compose).toContain(DEALTWIN_TEST_DATABASE_URL);
    expect(compose).toContain("127.0.0.1:55432:5432");
    expect(compose).toContain("POSTGRES_USER: dealtwin");
    expect(compose).toContain("POSTGRES_PASSWORD: dealtwin");
    expect(compose).toContain("POSTGRES_DB: dealtwin_test");
  });
});
