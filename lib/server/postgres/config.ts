export const DEALTWIN_TEST_DATABASE_URL = "postgres://dealtwin:dealtwin@127.0.0.1:55432/dealtwin_test";

export type DatabaseSslMode = "disable" | "verify-full";

export interface PostgresConfig {
  readonly connectionString: string;
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly sslMode: DatabaseSslMode;
  readonly ssl: false | { readonly rejectUnauthorized: true };
  readonly max: 10;
  readonly idleTimeoutMillis: 30000;
  readonly connectionTimeoutMillis: 5000;
  readonly statementTimeoutMillis: 5000;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertDisposableJudgeDatabaseUrl(connectionString:string):void {
  assertLocalTestDatabaseUrl(connectionString);
  const parsed=new URL(connectionString);
  if(decodeURIComponent(parsed.pathname.replace(/^\/+/,''))!=='dealtwin_test')
    throw new Error('Test database URL must target the disposable dealtwin_test database.');
  if(![55432,55632].includes(Number(parsed.port)))
    throw new Error('Test database URL must use the disposable DealTwin test port.');
}

function hostnameOf(connectionString: string): string {
  const parsed = new URL(connectionString);
  return parsed.hostname.replace(/^\[|\]$/g, "");
}

function parsePostgresUrl(connectionString: string): URL {
  try {
    return new URL(connectionString);
  } catch {
    throw new Error("PostgreSQL URL is not a valid connection string.");
  }
}

export function assertLocalTestDatabaseUrl(connectionString: string): void {
  let parsed: URL;
  try {
    parsed = parsePostgresUrl(connectionString);
  } catch {
    throw new Error("Test database URL must be a local/test PostgreSQL connection.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Test database URL must be a local/test PostgreSQL connection.");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Test database URL must be a local/test PostgreSQL host, not ${host}.`);
  }
}

export function parsePostgresConfig(env: NodeJS.Dict<string> = process.env): PostgresConfig {
  const connectionString = env.DATABASE_URL;
  if (typeof connectionString !== "string" || connectionString.length === 0) {
    throw new Error("DATABASE_URL is required.");
  }
  const parsed = parsePostgresUrl(connectionString);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres protocol.");
  }
  for (const key of parsed.searchParams.keys()) {
    if (key.toLowerCase().startsWith("ssl")) {
      throw new Error("SSL is configured only by DATABASE_SSL_MODE.");
    }
  }
  const sslMode = env.DATABASE_SSL_MODE;
  if (sslMode !== "disable" && sslMode !== "verify-full") {
    throw new Error("DATABASE_SSL_MODE must be disable or verify-full.");
  }
  if (sslMode === "disable" && !LOCAL_HOSTS.has(hostnameOf(connectionString))) {
    throw new Error("Remote PostgreSQL connections require verified TLS.");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!database) {
    throw new Error("DATABASE_URL must include a database name.");
  }
  const port = parsed.port === "" ? 5432 : Number(parsed.port);
  if (!Number.isSafeInteger(port) || port <= 0) {
    throw new Error("DATABASE_URL port is invalid.");
  }
  return {
    connectionString,
    host: hostnameOf(connectionString),
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    sslMode,
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: true },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statementTimeoutMillis: 5000,
  };
}
