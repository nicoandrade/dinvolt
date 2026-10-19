import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import settings from "../catalog/auth/config.json" with { type: "json" };
import { prepareAuthStarter } from "../src/auth.ts";
import { prepareDatabaseStarter } from "../src/database.ts";
import type { DatabaseProvider } from "../src/database.ts";

const directories: string[] = [];
const fixture = async (provider: DatabaseProvider) => {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-auth-test-"));
  directories.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "my-app",
      dependencies: { next: "16.4.2" },
      scripts: { dev: "next dev" },
    })
  );
  await writeFile(
    join(root, "AGENTS.md"),
    "# Existing Next.js, UI and Ultracite instructions\n"
  );
  await prepareDatabaseStarter(root, provider);
  return root;
};
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

test.each(["turso", "planetscale-postgres"] as const)(
  "configures Better Auth minimal, email/password and Admin for %s",
  async (provider) => {
    const root = await fixture(provider);
    const before = JSON.parse(
      await readFile(join(root, "package.json"), "utf-8")
    );
    await prepareAuthStarter(root, provider);
    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf-8")
    );
    expect(manifest.dependencies).toMatchObject(settings.dependencies);
    expect(manifest.devDependencies).toMatchObject(settings.devDependencies);
    expect(manifest.dependencies["better-auth"]).toBe(settings.version);
    expect(manifest.dependencies["@better-auth/drizzle-adapter"]).toBe(
      settings.version
    );
    expect(manifest.dependencies["drizzle-orm"]).toBe(
      before.dependencies["drizzle-orm"]
    );
    expect(manifest.devDependencies.auth).toBe(settings.version);
    expect(manifest.scripts["auth:generate"]).toContain(
      "scripts/auth-cli.mjs generate"
    );
    expect(manifest.scripts["auth:create-admin"]).toContain(
      "scripts/create-admin.mjs"
    );
    expect(manifest.scripts["db:migrate"]).toBe(
      "node scripts/with-database-env.mjs development drizzle-kit migrate"
    );
    const example = await readFile(join(root, ".env.example"), "utf-8");
    expect(example).toMatch(/^DEV_ADMIN_USER=$/mu);
    expect(example).toMatch(/^DEV_ADMIN_PASSWORD=$/mu);
    expect(
      await readFile(join(root, "scripts/wizard-admin.mjs"), "utf-8")
    ).toContain("createFirstAdmin");
    expect(
      await readFile(join(root, "src/lib/dev-admin.ts"), "utf-8")
    ).toContain('import "server-only"');
    const auth = await readFile(join(root, "src/lib/auth-config.ts"), "utf-8");
    expect(auth).toContain('from "better-auth/minimal"');
    expect(auth).toContain('from "@better-auth/drizzle-adapter"');
    expect(auth).toContain(
      `provider: "${provider === "turso" ? "sqlite" : "pg"}"`
    );
    expect(auth).toContain("sendResetPassword:");
    expect(auth).toContain("revokeSessionsOnPasswordReset: true");
    expect(auth).toContain("plugins: [admin(), nextCookies()]");
    expect(auth).toContain(
      `transaction: ${provider === "planetscale-postgres"}`
    );
    const entry = await readFile(join(root, "src/lib/auth.ts"), "utf-8");
    expect(entry).toContain('import "server-only"');
    // Keep module mocks and caches isolated from the rest of the test suite.
    const runtime = spawnSync(
      process.execPath,
      [
        "-e",
        `
      import assert from "node:assert/strict";
      import { mock } from "bun:test";
      const database = {};
      const instance = {};
      let connections = 0;
      let creations = 0;
      mock.module("server-only", () => ({}));
      mock.module("next/server", () => ({ after: () => {} }));
      mock.module("@/db", () => ({ getDb: () => { connections++; return database; } }));
      mock.module("./src/lib/auth-config.ts", () => ({ createAuth: (db) => {
        assert.equal(db, database);
        creations++;
        return instance;
      } }));
      const { getAuth } = await import("./src/lib/auth.ts");
      assert.equal(connections, 0);
      assert.equal(creations, 0);
      assert.equal(getAuth(), instance);
      assert.equal(getAuth(), instance);
      assert.equal(connections, 1);
      assert.equal(creations, 1);
    `,
      ],
      { cwd: root, encoding: "utf-8", timeout: 10_000 }
    );
    expect(runtime.status, runtime.stdout + runtime.stderr).toBe(0);
    expect(await readFile(join(root, "src/db/index.ts"), "utf-8")).toContain(
      'import "server-only"'
    );
    expect(await readFile(join(root, "auth.config.ts"), "utf-8")).toContain(
      'from "./src/db/connection"'
    );
    const client = await readFile(
      join(root, "src/lib/auth-client.ts"),
      "utf-8"
    );
    expect(client).toContain('from "better-auth/react"');
    expect(client).toContain("plugins: [adminClient()]");
    expect(
      await readFile(join(root, "src/app/api/auth/[...all]/route.ts"), "utf-8")
    ).toMatch(
      /toNextJsHandler\(\(request\) =>\s*getAuth\(\)\.handler\(request\)\s*\)/u
    );
    const schema = await readFile(join(root, "src/db/auth-schema.ts"), "utf-8");
    for (const field of [
      "user",
      "session",
      "account",
      "verification",
      "role",
      "banned",
      "banReason",
      "banExpires",
      "impersonatedBy",
    ]) {
      expect(schema).toContain(field);
    }
    expect(schema).toContain(
      provider === "turso" ? "drizzle-orm/sqlite-core" : "drizzle-orm/pg-core"
    );
    if (provider === "turso") {
      expect(schema).toContain('from "drizzle-orm/_relations"');
    }
    expect(await readFile(join(root, "src/db/schema.ts"), "utf-8")).toContain(
      'from "./auth-schema"'
    );
    const env = await readFile(join(root, ".env.example"), "utf-8");
    expect(env).toContain("BETTER_AUTH_SECRET=\n");
    expect(env).toContain("BETTER_AUTH_URL=https://my-app.localhost");
    const localEnv = await readFile(join(root, ".env.local"), "utf-8");
    const secret =
      localEnv.match(/^BETTER_AUTH_SECRET=(?<secret>.+)$/mu)?.groups?.secret ??
      "";
    expect(/^[A-Za-z0-9+/]{43}=$/u.test(secret)).toBe(true);
    expect(Buffer.from(secret, "base64").length).toBe(32);
    expect(
      localEnv.replace(/^BETTER_AUTH_SECRET=.+$/mu, "BETTER_AUTH_SECRET=")
    ).toBe(env);
    if (process.platform !== "win32") {
      // eslint-disable-next-line no-bitwise -- Mask POSIX permission bits to verify secret-file permissions.
      expect((await stat(join(root, ".env.local"))).mode & 0o777).toBe(0o600);
    }
    expect(spawnSync("git", ["init", "--quiet", root]).status).toBe(0);
    expect(
      spawnSync("git", ["check-ignore", "--no-index", ".env.local"], {
        cwd: root,
      }).status
    ).toBe(0);
    expect(
      spawnSync("git", ["check-ignore", "--no-index", ".env.example"], {
        cwd: root,
      }).status
    ).toBe(1);
    const instructions = await readFile(join(root, "AGENTS.md"), "utf-8");
    expect(instructions).toContain(
      "# Existing Next.js, UI and Ultracite instructions"
    );
    expect(instructions).toContain("<!-- BEGIN:dinvolt-database -->");
    expect(instructions).toContain("<!-- BEGIN:dinvolt-auth -->");
  }
);

test("auth preparation preserves a customized database schema and all existing files", async () => {
  const root = await fixture("turso");
  const manifest = await readFile(join(root, "package.json"), "utf-8");
  const env = await readFile(join(root, ".env.example"), "utf-8");
  await writeFile(join(root, "src/db/schema.ts"), "// My existing tables\n");
  await expect(prepareAuthStarter(root, "turso")).rejects.toThrow(
    "untouched database schema"
  );
  expect(await readFile(join(root, "package.json"), "utf-8")).toBe(manifest);
  expect(await readFile(join(root, ".env.example"), "utf-8")).toBe(env);
  expect(await readdir(join(root, "src/db"))).not.toContain("auth-schema.ts");
  expect(await readdir(root)).not.toContain(".env.local");
});

test("each starter receives a different private Better Auth secret", async () => {
  const secrets: string[] = [];
  for (const provider of ["turso", "planetscale-postgres"] as const) {
    const root = await fixture(provider);
    await prepareAuthStarter(root, provider);
    const localEnv = await readFile(join(root, ".env.local"), "utf-8");
    secrets.push(
      localEnv.match(/^BETTER_AUTH_SECRET=(?<secret>.+)$/mu)!.groups!.secret!
    );
  }
  expect(secrets[0] === secrets[1]).toBe(false);
});

test("auth preparation preserves an existing local environment and writes no auth files", async () => {
  const root = await fixture("turso");
  const originalManifest = await readFile(join(root, "package.json"), "utf-8");
  const originalEnv = await readFile(join(root, ".env.example"), "utf-8");
  const localEnv =
    "BETTER_AUTH_SECRET=existing-local-value\nOTHER_SETTING=keep\n";
  await writeFile(join(root, ".env.local"), localEnv);
  await expect(prepareAuthStarter(root, "turso")).rejects.toThrow(
    "would replace .env.local"
  );
  expect(await readFile(join(root, ".env.local"), "utf-8")).toBe(localEnv);
  expect(await readFile(join(root, "package.json"), "utf-8")).toBe(
    originalManifest
  );
  expect(await readFile(join(root, ".env.example"), "utf-8")).toBe(originalEnv);
  expect(await readdir(join(root, "src/db"))).not.toContain("auth-schema.ts");
});

test("auth preparation rejects conflicting scripts before writing routes or credentials", async () => {
  const root = await fixture("planetscale-postgres");
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf-8")
  );
  manifest.scripts["auth:generate"] = "my-auth-generator";
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  await expect(
    prepareAuthStarter(root, "planetscale-postgres")
  ).rejects.toThrow("would replace the auth:generate script");
  expect(await readFile(join(root, ".env.example"), "utf-8")).not.toContain(
    "BETTER_AUTH_SECRET="
  );
  expect(await readdir(join(root, "src/db"))).not.toContain("auth-schema.ts");
});
