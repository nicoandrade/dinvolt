// Internal subprocess: load dependencies from the freshly generated demo.
// All inputs/outputs use private pipes. Never forward provider diagnostics.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { testIdentity, verifyCredentials } from "./config.ts";
import type { Credentials } from "./config.ts";

interface Adapter {
  query: (sql: string, args?: string[]) => Promise<Record<string, unknown>[]>;
  transaction: <T>(
    action: (query: Adapter["query"]) => Promise<T>
  ) => Promise<T>;
  close: () => Promise<void>;
}

async function main() {
  const { credentials, operation, run } = JSON.parse(
    await Bun.stdin.text()
  ) as { credentials: Credentials; operation: string; run: string };
  const directory = process.cwd();
  const identity = testIdentity(run);
  const require = createRequire(join(directory, "package.json"));
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(
    directory,
    true,
    {
      info() {
        /* Keep dotenv diagnostics private. */
      },
      error() {
        /* Keep dotenv diagnostics private. */
      },
    },
    true
  );
  verifyCredentials(process.env, credentials);
  const { createJiti } = require("jiti");
  const jiti = createJiti(join(directory, "package.json"), {
    tsconfigPaths: true,
  });
  const environment = await jiti.import(
    join(directory, "src/db/environment.ts")
  );
  assert.equal(environment.getDatabaseEnvironment(), "development");
  for (const key of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] as const) {
    assert.equal(environment.databaseVariable(key), credentials[key]);
  }
  const { initialAdapter } = await import(
    pathToFileURL(join(directory, "scripts/initial-driver.mjs")).href
  );
  const adapter: Adapter = await initialAdapter("turso", credentials);
  try {
    if (operation === "inspect") {
      const { inspectSchema, inspectInitialDatabase } = await import(
        pathToFileURL(join(directory, "scripts/initial-schema.mjs")).href
      );
      const initial = JSON.parse(
        await readFile(
          join(directory, ".dinvolt/initial-database.json"),
          "utf-8"
        )
      );
      const schema = await inspectSchema(adapter.query, "turso");
      const historyTable = await adapter.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
      );
      const history = historyTable.length
        ? await adapter.query(
            'SELECT hash, created_at, name FROM "__drizzle_migrations"'
          )
        : [];
      if (schema.length === 0 && history.length === 0) {
        return { state: "empty" };
      }
      assert.equal(
        history.length,
        1,
        "Shared migration history requires review."
      );
      assert.equal(
        history[0]?.hash,
        initial.hash,
        "Shared migration SQL differs."
      );
      // A fresh demo has a different timestamp/name. Check the original record
      // against its own metadata after verifying identical SQL; never rewrite it.
      assert.ok(Number.isFinite(Number(history[0]?.created_at)));
      assert.equal(typeof history[0]?.name, "string");
      assert.equal(
        await inspectInitialDatabase(adapter.query, "turso", {
          ...initial,
          folderMillis: Number(history[0]?.created_at),
          name: history[0]?.name,
        }),
        "ready",
        "Shared schema or migration history differs."
      );
      return { state: "ready" };
    }
    if (operation === "admin") {
      const { bootstrap } = await jiti.import(
        join(directory, "scripts/admin-bootstrap.ts")
      );
      await bootstrap.checkDatabase();
      const { createInitialAdmin } = await import(
        pathToFileURL(join(directory, "scripts/admin-creation.mjs")).href
      );
      return await createInitialAdmin(
        bootstrap.auth,
        `E2E Admin ${run}`,
        identity.adminEmail
      );
    }
    if (operation === "persisted") {
      const rows = await adapter.query(
        'SELECT name, role FROM "user" WHERE email = ?',
        [identity.userEmail]
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.name, `E2E User ${run}`);
      assert.equal(rows[0]?.role, "user");
      const accounts = await adapter.query(
        'SELECT id FROM account WHERE user_id IN (SELECT id FROM "user" WHERE email = ?) AND provider_id = ?',
        [identity.userEmail, "credential"]
      );
      assert.equal(accounts.length, 1);
      return { persisted: true };
    }
    if (operation === "denied") {
      const rows = await adapter.query(
        'SELECT id FROM "user" WHERE email = ?',
        [identity.deniedEmail]
      );
      assert.equal(rows.length, 0);
      return { denied: true };
    }
    if (operation === "cleanup") {
      const emails = Object.values(identity);
      // Exact run-owned emails only. Explicit children also work without FK enforcement.
      await adapter.transaction(async (query) => {
        for (const table of ["session", "account"]) {
          await query(
            `DELETE FROM "${table}" WHERE user_id IN (SELECT id FROM "user" WHERE email IN (?, ?, ?))`,
            emails
          );
          const remaining = await query(
            `SELECT id FROM "${table}" WHERE user_id IN (SELECT id FROM "user" WHERE email IN (?, ?, ?))`,
            emails
          );
          assert.equal(remaining.length, 0);
        }
        await query('DELETE FROM "user" WHERE email IN (?, ?, ?)', emails);
        const remaining = await query(
          'SELECT id FROM "user" WHERE email IN (?, ?, ?)',
          emails
        );
        assert.equal(remaining.length, 0);
      });
      return { cleaned: true };
    }
    throw new Error("Unknown internal E2E operation.");
  } finally {
    await adapter.close();
  }
}

try {
  process.stdout.write(JSON.stringify({ ok: true, result: await main() }));
} catch {
  process.stdout.write(JSON.stringify({ ok: false }));
  process.exitCode = 1;
}
