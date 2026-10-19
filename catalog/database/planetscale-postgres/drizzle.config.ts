/* eslint-disable unicorn/no-top-level-side-effects -- Drizzle Kit loads environment and evaluates this configuration at startup. */
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

import { databaseVariable } from "./src/db/environment";

// Capture before Next loads files: explicit script targets always win.
const environment = process.env.DINVOLT_DATABASE_ENV ?? "development";
loadEnvConfig(process.cwd(), environment === "development");
process.env.DINVOLT_DATABASE_ENV = environment;
const needsConnection = process.argv.some((argument) =>
  ["migrate", "studio", "push", "pull", "introspect"].includes(argument)
);
// Schema generation/checking stay independent of credentials and selected environments.
const credential = (name: string) =>
  needsConnection ? databaseVariable(name) : undefined;

export default defineConfig({
  dbCredentials: {
    url: credential("DATABASE_URL_DIRECT") ?? "",
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
