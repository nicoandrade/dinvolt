import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { databaseVariable, getDatabaseEnvironment } from "./environment";
import { schema } from "./schema";

// Per instance, not a deployment-wide limit. Tune for concurrency and database capacity.
const POOL_MAX = 5;
const POOL_CONNECTION_TIMEOUT_MS = 5000;
// attachDatabasePool keeps Vercel alive long enough for idle connections to close.
const PRODUCTION_IDLE_TIMEOUT_MS = 5000;
const DEVELOPMENT_IDLE_TIMEOUT_MS = 10_000;

const createDatabase = () => {
  const connectionString = databaseVariable("DATABASE_URL");
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis:
      process.env.NODE_ENV === "production"
        ? PRODUCTION_IDLE_TIMEOUT_MS
        : DEVELOPMENT_IDLE_TIMEOUT_MS,
    max: POOL_MAX,
  });
  attachDatabasePool(pool);
  pool.on("error", (error: Error) => {
    console.error("Unexpected Postgres pool error", error);
  });
  return drizzle({ client: pool, schema });
};

const globalForDatabase = globalThis as typeof globalThis & {
  dinvoltDatabases?: Partial<Record<string, ReturnType<typeof createDatabase>>>;
};

const getDb = () => {
  const environment = getDatabaseEnvironment();
  globalForDatabase.dinvoltDatabases ??= {};
  const databases = globalForDatabase.dinvoltDatabases;
  return (databases[environment] ??= createDatabase());
};

export { getDb };
