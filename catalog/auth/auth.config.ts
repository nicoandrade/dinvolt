/* eslint-disable unicorn/no-top-level-side-effects -- This configuration is evaluated only by the Better Auth CLI. */
import { loadEnvConfig } from "@next/env";

import { getDb } from "./src/db/connection";
import { createAuth } from "./src/lib/auth-config";

const environment = process.env.DINVOLT_DATABASE_ENV ?? "development";
loadEnvConfig(process.cwd(), environment === "development");
process.env.DINVOLT_DATABASE_ENV = environment;

const auth = createAuth(getDb());

export { auth };
