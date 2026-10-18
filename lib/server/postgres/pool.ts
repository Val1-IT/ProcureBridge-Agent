import { Pool } from "pg";
import { parsePostgresConfig, type PostgresConfig } from "./config";

let processPool: Pool | undefined;

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
