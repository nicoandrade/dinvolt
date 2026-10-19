import "server-only";
import { connect } from "@tursodatabase/serverless";
import { defineRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/tursodatabase-serverless";

import { databaseVariable, getDatabaseEnvironment } from "./environment";
import { schema } from "./schema";

const createDatabase = () => {
  const url = databaseVariable("TURSO_DATABASE_URL");
  const authToken = databaseVariable("TURSO_AUTH_TOKEN");
  const client = connect({ authToken, url });
  return drizzle({ client, relations: defineRelations(schema) });
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
