/* eslint-disable unicorn/no-top-level-side-effects -- Private wizard subprocess protocol. */
import { readFile } from "node:fs/promises";

import { createJiti } from "jiti";

import { checkAdminDatabase, createFirstAdmin } from "./admin-creation.mjs";

const main = async () => {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const { connection, name, email, inspect } = JSON.parse(input);
  const metadata = JSON.parse(await readFile(".dinvolt/config.json", "utf-8"));
  const { environment } = connection;
  if (
    !metadata.database.environments.includes(environment) ||
    !connection.credentials
  ) {
    throw new Error("Invalid target.");
  }
  // Override inherited credentials before @next/env loads files. No fallback to
  // another endpoint, even when the CLI inherited a different deployment env.
  process.env.DINVOLT_DATABASE_ENV = environment;
  for (const key of [
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "DATABASE_URL",
    "DATABASE_URL_DIRECT",
  ]) {
    for (const suffix of ["", "_STAGING", "_PRODUCTION"]) {
      process.env[`${key}${suffix}`] = "";
    }
    const suffix =
      environment === "development" ? "" : `_${environment.toUpperCase()}`;
    process.env[`${key}${suffix}`] = connection.credentials[key] ?? "";
  }
  const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
  const { bootstrap } = await jiti.import("./admin-bootstrap.ts");
  if (bootstrap.getDatabaseEnvironment() !== environment) {
    throw new Error("Invalid target.");
  }
  if (inspect) {
    await checkAdminDatabase(
      bootstrap.checkDatabase,
      environment,
      metadata.packageManager
    );
    return {
      status: (await bootstrap.hasAdministrator()) ? "existing" : "available",
    };
  }
  if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email ?? "")) {
    throw new Error("Invalid identity.");
  }
  return createFirstAdmin(
    bootstrap,
    name.trim(),
    email.trim().toLowerCase(),
    metadata.packageManager
  );
};

try {
  console.log(JSON.stringify(await main()));
} catch {
  // Includes duplicates and interrupted writes. Never echo a driver, loader or
  // auth error (it may contain connection strings, SQL or the new password).
  console.log(JSON.stringify({ status: "failed" }));
  process.exitCode = 1;
}
