import { Pool, type PoolConfig } from "pg";
import { parsePostgresConfig, type PostgresConfig } from "./config";

let processPool: Pool | undefined;

/** pg deliberately hides passwords from enumeration; object spread alone loses authentication. */
export function createIndependentPostgresPool(pool: Pool, options: Pick<PoolConfig, "max" | "application_name"> = {}): Pool {
  return new Pool({ ...pool.options, password: pool.options.password, ...options });
}

export function createPostgresPool(config: PostgresConfig): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    statement_timeout: config.statementTimeoutMillis,
    query_timeout: config.statementTimeoutMillis,
  });
}

export function getPostgresPool(config: PostgresConfig = parsePostgresConfig()): Pool {
  if (!processPool) processPool = createPostgresPool(config);
  return processPool;
}
