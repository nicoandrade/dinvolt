/* eslint-disable unicorn/no-top-level-side-effects -- Trusted database CLI entry point; errors never expose driver diagnostics. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";

import { initialAdapter } from "./initial-driver.mjs";
import {
  initialSchema,
  initializeInitialDatabase,
  migrationDigest,
  verifyInitialAuthSchema,
} from "./initial-schema.mjs";

const verifyApplication = async (provider, credentials, initial, result) => {
  // PgBouncer and the direct URL must expose the same ready schema/history.
  let application;
  try {
    application = await initialAdapter(provider, {
      DATABASE_URL_DIRECT: credentials.DATABASE_URL,
    });
    if (
      !(await verifyInitialAuthSchema(application.query, provider, initial))
    ) {
      return { connected: true, status: "application-pending" };
    }
  } catch {
    return { connected: true, status: "application-pending" };
  } finally {
    await application?.close().catch(() => {
      /* Do not expose connection cleanup errors. */
    });
  }
  return result;
};

// eslint-disable-next-line complexity -- Keep all local migration guards before the private worker protocol and any remote connection.
const main = async () => {
  const metadata = JSON.parse(await readFile(".dinvolt/config.json", "utf-8"));
  const { provider } = metadata.database;
  const wizard = process.argv.includes("--wizard");
  const reviewRequired = () => {
    if (wizard) {
      console.log(
        JSON.stringify({ connected: false, status: "review-required" })
      );
    } else {
      console.error(
        "Local schema or migrations changed. Review db:generate output and apply reviewed db:migrate changes for the explicit environment; db:init preserved the database."
      );
      process.exitCode = 1;
    }
  };
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  if (migrations.length !== 1) {
    reviewRequired();
    return;
  }
  const [migration] = migrations;
  const initialPath = ".dinvolt/initial-database.json";
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      ["src/db/schema.ts", "src/db/auth-schema.ts"].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ])
    )
  );
  if (process.argv.includes("--prepare")) {
    const snapshotPath =
      provider === "turso"
        ? path.join("drizzle", migration.name, "snapshot.json")
        : "drizzle/meta/0000_snapshot.json";
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf-8"));
    await writeFile(
      initialPath,
      `${JSON.stringify({ provider, sourceHashes, hash: migration.hash, digest: migrationDigest(migration), folderMillis: migration.folderMillis, name: migration.name, schema: await initialSchema(provider, migration, snapshot) }, null, 2)}\n`,
      { flag: "wx" }
    );
    return;
  }
  const initial = JSON.parse(await readFile(initialPath, "utf-8"));
  if (
    initial.provider !== provider ||
    initial.hash !== migration.hash ||
    initial.digest !== migrationDigest(migration) ||
    (initial.sourceHashes &&
      Object.entries(sourceHashes).some(
        ([file, hash]) => initial.sourceHashes[file] !== hash
      ))
  ) {
    reviewRequired();
    return;
  }
  let credentials;
  let environment;
  if (wizard) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    ({ credentials, environment } = JSON.parse(input));
  } else {
    const { loadEnvConfig } = await import("@next/env");
    const target = process.env.DINVOLT_DATABASE_ENV ?? "development";
    loadEnvConfig(process.cwd(), target === "development");
    process.env.DINVOLT_DATABASE_ENV = target;
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url);
    const { databaseVariable, getDatabaseEnvironment } = await jiti.import(
      "../src/db/environment.ts"
    );
    environment = getDatabaseEnvironment();
    credentials = Object.fromEntries(
      (provider === "turso"
        ? ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]
        : ["DATABASE_URL", "DATABASE_URL_DIRECT"]
      ).map((name) => [name, databaseVariable(name)])
    );
  }
  if (!metadata.database.environments.includes(environment)) {
    throw new Error("Select a configured database environment.");
  }
  let result;
  try {
    const adapter = await initialAdapter(provider, credentials);
    result = await initializeInitialDatabase(
      adapter,
      provider,
      initial,
      migration
    );
    if (
      provider !== "turso" &&
      ["ready", "initialized"].includes(result.status)
    ) {
      result = await verifyApplication(provider, credentials, initial, result);
    }
  } catch {
    result = { connected: false, status: "failed" };
  }
  if (wizard) {
    console.log(JSON.stringify(result));
  } else {
    console.log(
      `${environment}: ${result.status}. ${["ready", "initialized"].includes(result.status) ? "Initial migration and auth tables verified." : "Initialization pending. Project, credentials and migrations were preserved. See docs/database.md."}`
    );
    if (!["ready", "initialized"].includes(result.status)) {
      process.exitCode = 1;
    }
  }
};
try {
  await main();
} catch {
  console.error(
    "Initial database setup could not complete. Preserve drizzle/ and .dinvolt/initial-database.json; check credentials and docs/database.md. No driver details are displayed."
  );
  process.exitCode = 1;
}
