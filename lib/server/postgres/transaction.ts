import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

const activeTransaction = new AsyncLocalStorage<true>();

function canonicalText(value: string): boolean {
  return value.length > 0 && value.trim() === value;
}

export async function withPostgresClient<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await action(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  pool: Pool,
  tenantId: string,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!canonicalText(tenantId)) {
    throw new Error("Transaction tenant identity must be canonical non-empty text.");
  }
  if (activeTransaction.getStore()) {
    throw new Error("Nested withTransaction is not supported.");
  }
  return activeTransaction.run(true, async () => {
    const client = await pool.connect();
    let began = false;
    try {
      await client.query("BEGIN");
      began = true;
      await client.query("SET LOCAL statement_timeout = 5000");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (began) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original callback or statement error.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  });
}
