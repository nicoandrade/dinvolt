import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import settings from "../catalog/database/config.json" with { type: "json" };
import { databases, prepareDatabaseStarter } from "../src/database.ts";

const directories: string[] = [];
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-db-test-"));
  directories.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "my-app",
      dependencies: { next: "16.4.2", custom: "1.0.0" },
      scripts: { dev: "next dev" },
    })
  );
  await writeFile(join(root, ".gitignore"), ".env*\nnode_modules/\n");
  await writeFile(
    join(root, "AGENTS.md"),
    "# Existing Next.js and UI instructions\n"
  );
  return root;
};
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

test.each([...databases])(
  "prepares $value with its driver, schema, credentials and migration scripts",
  async ({ value }) => {
    const root = await fixture();
    await prepareDatabaseStarter(root, value);
    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf-8")
    );
    expect(manifest.dependencies.next).toBe("16.4.2");
    expect(manifest.dependencies.custom).toBe("1.0.0");
    expect(manifest.dependencies).toMatchObject({
      ...settings.dependencies,
      ...settings.providers[value].dependencies,
    });
    expect(manifest.devDependencies).toMatchObject({
      ...settings.devDependencies,
      ...settings.providers[value].devDependencies,
    });
    expect(manifest.scripts.dev).toBe(
      "node scripts/with-database-env.mjs development next dev"
    );
    expect(manifest.scripts["db:generate"]).toBe("drizzle-kit generate");
    expect(manifest.scripts["db:migrate"]).toBe(
      "node scripts/with-database-env.mjs development drizzle-kit migrate"
    );
    expect(manifest.scripts["db:check"]).toBe("drizzle-kit check");
    expect(manifest.scripts["db:studio"]).toBe(
      "node scripts/with-database-env.mjs development drizzle-kit studio"
    );
    const env = await readFile(join(root, ".env.example"), "utf-8");
    const config = await readFile(join(root, "drizzle.config.ts"), "utf-8");
    const index = await readFile(join(root, "src/db/index.ts"), "utf-8");
    expect(index).toContain('import "server-only"');
    expect(config).toContain("loadEnvConfig(process.cwd()");
    if (value === "turso") {
      expect(manifest.dependencies["@tursodatabase/serverless"]).toBeDefined();
      expect(manifest.dependencies["@libsql/client"]).toBeUndefined();
      expect(manifest.dependencies.pg).toBeUndefined();
      expect(env).toContain("TURSO_DATABASE_URL=");
      expect(env).toContain("TURSO_AUTH_TOKEN=");
      expect(env).not.toContain("DATABASE_URL_DIRECT=");
      expect(config).toContain('dialect: "turso"');
      expect(config).toContain('replace(/^turso:/u, "https:")');
      expect(env).toContain("TURSO_DATABASE_URL=turso://");
      expect(env).not.toContain("TURSO_DATABASE_URL=file:");
    } else {
      expect(manifest.dependencies["@vercel/functions"]).toBeDefined();
      expect(manifest.dependencies.pg).toBeDefined();
      expect(manifest.dependencies["@neondatabase/serverless"]).toBeUndefined();
      expect(manifest.devDependencies["@types/pg"]).toBeDefined();
      expect(manifest.dependencies["@libsql/client"]).toBeUndefined();
      expect(
        manifest.dependencies["@tursodatabase/serverless"]
      ).toBeUndefined();
      expect(env).toContain("DATABASE_URL=");
      expect(env).toContain(":6432/");
      expect(env).toContain("DATABASE_URL_DIRECT=");
      expect(env).toContain(":5432/");
      expect(env).toContain("sslmode=verify-full");
      expect(config).toContain('dialect: "postgresql"');
      expect(config).toContain('credential("DATABASE_URL_DIRECT")');
    }
    // Execute generated code with inert drivers in a fresh process per mode.
    // This checks lazy initialization and reuse without database credentials.
    for (const mode of value === "turso"
      ? ["production"]
      : ["production", "development"]) {
      const runtime = spawnSync(
        process.execPath,
        [
          "-e",
          `
        import assert from "node:assert/strict";
        import { mock } from "bun:test";
        const provider = ${JSON.stringify(value)};
        const mode = ${JSON.stringify(mode)};
        process.env.NODE_ENV = mode;
        delete process.env.VERCEL_ENV;
        delete process.env.DINVOLT_DATABASE_ENV;
        delete process.env.DATABASE_URL;
        delete process.env.TURSO_DATABASE_URL;
        delete process.env.TURSO_AUTH_TOKEN;
        const schema = {};
        const relations = {};
        const database = {};
        const events = [];
        let client;
        mock.module("server-only", () => ({}));
        mock.module("./src/db/schema.ts", () => ({ schema }));
        mock.module("@tursodatabase/serverless", () => ({ connect: (options) => {
          assert.deepEqual(options, { url: "turso://test.invalid", authToken: "test-only" });
          events.push("connect");
          client = {};
          return client;
        } }));
        mock.module("drizzle-orm", () => ({ defineRelations: (actual) => {
          assert.equal(actual, schema);
          return relations;
        } }));
        mock.module("pg", () => ({ Pool: class {
          constructor(options) {
            assert.deepEqual(options, {
              connectionString: "postgres://test.invalid/test",
              connectionTimeoutMillis: 5000,
              idleTimeoutMillis: mode === "production" ? 5000 : 10000,
              max: 5,
            });
            events.push("connect");
            client = this;
          }
          on() {}
        } }));
        mock.module("@vercel/functions", () => ({ attachDatabasePool: (pool) => {
          assert.equal(pool, client);
          events.push("attach");
        } }));
        const driver = provider === "turso" ? "tursodatabase-serverless" : "node-postgres";
        mock.module("drizzle-orm/" + driver, () => ({ drizzle: (options) => {
          assert.deepEqual(options, provider === "turso" ? { client, relations } : { client, schema });
          events.push("drizzle");
          return database;
        } }));
        const { getDb } = await import("./src/db/index.ts");
        assert.deepEqual(events, []);
        assert.throws(() => getDb(), /Set .* in .env.local/);
        assert.deepEqual(events, []);
        process.env.DATABASE_URL = "postgres://test.invalid/test";
        process.env.TURSO_DATABASE_URL = "turso://test.invalid";
        process.env.TURSO_AUTH_TOKEN = "test-only";
        assert.equal(getDb(), database);
        assert.equal(getDb(), database);
        assert.deepEqual(events, provider === "turso" ? ["connect", "drizzle"] : ["connect", "attach", "drizzle"]);
      `,
        ],
        { cwd: root, encoding: "utf-8", timeout: 10_000 }
      );
      expect(runtime.status, runtime.stdout + runtime.stderr).toBe(0);
    }
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toContain(
      "# Existing Next.js and UI instructions"
    );
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toContain(
      "<!-- BEGIN:dinvolt-database -->"
    );
    expect(await readFile(join(root, "docs/database.md"), "utf-8")).toContain(
      "db:generate"
    );
    expect(await readdir(root)).not.toContain(".env.local");
    expect(await readdir(root)).not.toContain(".env");
    spawnSync("git", ["init", "--quiet"], { cwd: root });
    expect(
      spawnSync("git", ["check-ignore", ".env.example"], { cwd: root }).status
    ).toBe(1);
    expect(
      spawnSync("git", ["check-ignore", ".env.local"], { cwd: root }).status
    ).toBe(0);
  }
);

test("Turso is the default database", async () => {
  const root = await fixture();
  await prepareDatabaseStarter(root);
  expect(await readFile(join(root, "drizzle.config.ts"), "utf-8")).toContain(
    'dialect: "turso"'
  );
});

test("conflicting schema files and scripts are preserved before any writes", async () => {
  const root = await fixture();
  await mkdir(join(root, "src/db"), { recursive: true });
  await writeFile(join(root, "src/db/schema.ts"), "// Existing schema\n");
  const original = await readFile(join(root, "package.json"), "utf-8");
  await expect(prepareDatabaseStarter(root)).rejects.toThrow(
    "would replace src/db/schema.ts"
  );
  expect(await readFile(join(root, "src/db/schema.ts"), "utf-8")).toBe(
    "// Existing schema\n"
  );
  expect(await readFile(join(root, "package.json"), "utf-8")).toBe(original);
  expect(await readdir(root)).not.toContain(".env.example");
  await rm(join(root, "src"), { recursive: true });
  const manifest = JSON.parse(original);
  manifest.scripts["db:migrate"] = "custom-migrate";
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  await expect(prepareDatabaseStarter(root)).rejects.toThrow(
    "would replace the db:migrate script"
  );
  expect(await readdir(root)).not.toContain(".env.example");
});

test("database setup refuses symlinked env files", async () => {
  const root = await fixture();
  const outside = join(root, "preserve.txt");
  await writeFile(outside, "preserve me");
  await symlink(outside, join(root, ".env.example"));
  await expect(prepareDatabaseStarter(root)).rejects.toThrow("symbolic link");
  expect(await readFile(outside, "utf-8")).toBe("preserve me");
  expect(await readdir(root)).not.toContain("src");
});

test("validates and normalizes database selections before writing files", async () => {
  const { normalizeDatabaseEnvironments } = await import("../src/database.ts");
  expect(normalizeDatabaseEnvironments()).toEqual(["development"]);
  expect(
    normalizeDatabaseEnvironments(["production", "staging", "production"])
  ).toEqual(["staging", "production"]);
  const root = await fixture();
  const before = await readdir(root);
  await expect(prepareDatabaseStarter(root, "turso", [])).rejects.toThrow(
    "Select at least one"
  );
  await expect(
    prepareDatabaseStarter(root, "turso", ["invalid" as never])
  ).rejects.toThrow("Select at least one");
  expect(await readdir(root)).toEqual(before);
});

test.each([...databases])(
  "generates every nonempty environment combination for $value without cross-environment credentials",
  async ({ value }) => {
    const { databaseEnvironments } = await import("../src/database.ts");
    const { prepareAuthStarter } = await import("../src/auth.ts");
    for (let mask = 1; mask < 8; mask += 1) {
      const selected = databaseEnvironments.filter(
        (_, index) => Math.floor(mask / 2 ** index) % 2 === 1
      );
      const root = await fixture();
      await prepareDatabaseStarter(root, value, selected);
      await prepareAuthStarter(root, value, selected);
      const manifest = JSON.parse(
        await readFile(join(root, "package.json"), "utf-8")
      );
      const example = await readFile(join(root, ".env.example"), "utf-8");
      const local = await readFile(join(root, ".env.local"), "utf-8");
      for (const environment of databaseEnvironments) {
        const suffix =
          environment === "development" ? "" : `_${environment.toUpperCase()}`;
        const variable =
          value === "turso"
            ? `TURSO_DATABASE_URL${suffix}=`
            : `DATABASE_URL_DIRECT${suffix}=`;
        expect(example.includes(variable)).toBe(selected.includes(environment));
        expect(local.includes(variable)).toBe(selected.includes(environment));
        if (environment !== "development") {
          for (const command of [
            "db:migrate",
            "db:studio",
            "auth:create-admin",
            "auth:generate",
          ]) {
            expect(Boolean(manifest.scripts[`${command}:${environment}`])).toBe(
              selected.includes(environment)
            );
            if (selected.includes(environment)) {
              expect(manifest.scripts[`${command}:${environment}`]).toContain(
                `with-database-env.mjs ${environment} `
              );
            }
          }
        }
      }
      const result = spawnSync(
        process.execPath,
        [
          "-e",
          `
      import assert from "node:assert/strict";
      const { configuredDatabaseEnvironments, getDatabaseEnvironment, databaseVariable } = await import("./src/db/environment.ts");
      assert.deepEqual(configuredDatabaseEnvironments, ${JSON.stringify(selected)});
      for (const environment of ["development", "staging", "production"]) {
        if (configuredDatabaseEnvironments.includes(environment)) {
          assert.equal(getDatabaseEnvironment({ DINVOLT_DATABASE_ENV: environment }), environment);
        } else {
          assert.throws(() => databaseVariable("DATABASE_URL", true, { DINVOLT_DATABASE_ENV: environment, DATABASE_URL: "do-not-use" }), /not configured/);
        }
      }
    `,
        ],
        { cwd: root, encoding: "utf-8" }
      );
      expect(result.status, result.stderr).toBe(0);
    }
  }
);

test("resolves Vercel, explicit overrides and missing credentials without fallback", async () => {
  const root = await fixture();
  await prepareDatabaseStarter(root, "turso", [
    "development",
    "staging",
    "production",
  ]);
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    import assert from "node:assert/strict";
    const { getDatabaseEnvironment, databaseVariable } = await import("./src/db/environment.ts");
    assert.equal(getDatabaseEnvironment({ NODE_ENV: "production" }), "development");
    assert.equal(getDatabaseEnvironment({ VERCEL_ENV: "development" }), "development");
    assert.equal(getDatabaseEnvironment({ VERCEL_ENV: "preview" }), "staging");
    assert.equal(getDatabaseEnvironment({ VERCEL_ENV: "production" }), "production");
    assert.equal(getDatabaseEnvironment({ VERCEL_ENV: "production", DINVOLT_DATABASE_ENV: "development" }), "development");
    for (const invalid of ["", "preview", "invalid"]) {
      assert.throws(() => getDatabaseEnvironment({ DINVOLT_DATABASE_ENV: invalid }), /Invalid database environment/);
    }
    for (const invalid of ["", "staging", "custom", "invalid"]) {
      assert.throws(() => getDatabaseEnvironment({ VERCEL_ENV: invalid }), /Invalid database environment/);
      assert.equal(getDatabaseEnvironment({ VERCEL_ENV: invalid, DINVOLT_DATABASE_ENV: "staging" }), "staging");
    }
    for (const name of ["DATABASE_URL", "DATABASE_URL_DIRECT", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
      const env = { [name]: "dev", [name + "_STAGING"]: "stage", [name + "_PRODUCTION"]: "prod" };
      assert.equal(databaseVariable(name, true, env), "dev");
      assert.equal(databaseVariable(name, true, { ...env, VERCEL_ENV: "preview" }), "stage");
      assert.equal(databaseVariable(name, true, { ...env, VERCEL_ENV: "production" }), "prod");
      for (const missing of [undefined, "", "   "]) {
        assert.throws(() => databaseVariable(name, true, { ...env, VERCEL_ENV: "production", [name + "_PRODUCTION"]: missing }), new RegExp("Set " + name + "_PRODUCTION"));
      }
    }
  `,
    ],
    { cwd: root, encoding: "utf-8" }
  );
  expect(result.status, result.stderr).toBe(0);
});

test("script wrapper overrides inherited targets and passes literal arguments without shell evaluation", async () => {
  const root = await fixture();
  await prepareDatabaseStarter(root, "turso", [
    "development",
    "staging",
    "production",
  ]);
  const literal = 'Admin & echo unsafe; $(echo unsafe) "quoted"';
  for (const environment of ["development", "staging", "production"]) {
    const result = spawnSync(
      "node",
      [
        "scripts/with-database-env.mjs",
        environment,
        "node",
        "-e",
        `
      const assert = require("node:assert/strict");
      assert.equal(process.env.DINVOLT_DATABASE_ENV, ${JSON.stringify(environment)});
      assert.equal(process.argv[1], ${JSON.stringify(literal)});
    `,
        literal,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          DINVOLT_DATABASE_ENV: "wrong",
          VERCEL_ENV: "production",
        },
        encoding: "utf-8",
      }
    );
    expect(result.status, result.stderr).toBe(0);
  }
});

test.each([...databases])(
  "keeps $value runtime clients isolated when the selected environment changes",
  async ({ value }) => {
    const root = await fixture();
    await prepareDatabaseStarter(root, value, [
      "development",
      "staging",
      "production",
    ]);
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    const urls = [];
    mock.module("server-only", () => ({}));
    mock.module("./src/db/schema.ts", () => ({ schema: {} }));
    mock.module("drizzle-orm", () => ({ defineRelations: () => ({}) }));
    mock.module("@tursodatabase/serverless", () => ({ connect: ({ url }) => { urls.push(url); return {}; } }));
    mock.module("pg", () => ({ Pool: class { constructor({ connectionString }) { urls.push(connectionString); } on() {} } }));
    mock.module("@vercel/functions", () => ({ attachDatabasePool() {} }));
    mock.module("drizzle-orm/tursodatabase-serverless", () => ({ drizzle: () => ({}) }));
    mock.module("drizzle-orm/node-postgres", () => ({ drizzle: () => ({}) }));
    const { getDb } = await import("./src/db/index.ts");
    assert.equal(urls.length, 0);
    const clients = [];
    for (const environment of ["development", "staging", "production"]) {
      process.env.DINVOLT_DATABASE_ENV = environment;
      const suffix = environment === "development" ? "" : "_" + environment.toUpperCase();
      process.env["DATABASE_URL" + suffix] = environment;
      process.env["TURSO_DATABASE_URL" + suffix] = environment;
      process.env["TURSO_AUTH_TOKEN" + suffix] = "test-only";
      clients.push(getDb());
      assert.equal(getDb(), clients.at(-1));
    }
    assert.equal(new Set(clients).size, 3);
    assert.deepEqual(urls, ["development", "staging", "production"]);
    process.env.DINVOLT_DATABASE_ENV = "development";
    assert.equal(getDb(), clients[0]);
  `,
      ],
      { cwd: root, encoding: "utf-8" }
    );
    expect(result.status, result.stderr).toBe(0);
  }
);

test.each([...databases])(
  "package scripts select exact $value credentials despite inherited selectors",
  async ({ value }) => {
    const root = await fixture();
    const { prepareAuthStarter } = await import("../src/auth.ts");
    await prepareDatabaseStarter(root, value, [
      "development",
      "staging",
      "production",
    ]);
    await prepareAuthStarter(root, value, [
      "development",
      "staging",
      "production",
    ]);
    const capture = `
    const { databaseVariable, getDatabaseEnvironment } = await import("../../src/db/environment.ts");
    const command = process.argv[2];
    const variable = ${JSON.stringify(value)} === "turso" ? "TURSO_DATABASE_URL" : command === "create-admin" ? "DATABASE_URL" : "DATABASE_URL_DIRECT";
    console.log(JSON.stringify({ environment: getDatabaseEnvironment(), credential: databaseVariable(variable) }));
  `;
    // Exercise the generated target wrapper without starting the interactive admin UI.
    await writeFile(
      join(root, "scripts/create-admin.mjs"),
      capture
        .replace("../../src/db/environment.ts", "../src/db/environment.ts")
        .replace("process.argv[2]", '"create-admin"')
    );
    for (const name of ["drizzle-kit", "auth"]) {
      await mkdir(join(root, "node_modules", name), { recursive: true });
      await writeFile(
        join(root, "node_modules", name, "package.json"),
        JSON.stringify({
          name,
          type: "module",
          bin: { [name]: "index.mjs" },
          exports: { "./api": "./api.mjs" },
        })
      );
      await writeFile(join(root, "node_modules", name, "index.mjs"), capture);
      await writeFile(
        join(root, "node_modules", name, "api.mjs"),
        "export {};"
      );
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      VERCEL_ENV: "production",
      DINVOLT_DATABASE_ENV: "invalid",
    };
    for (const environment of ["development", "staging", "production"]) {
      const suffix =
        environment === "development" ? "" : `_${environment.toUpperCase()}`;
      for (const variable of [
        "DATABASE_URL",
        "DATABASE_URL_DIRECT",
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
      ]) {
        env[`${variable}${suffix}`] = `${environment}-${variable}`;
      }
    }
    for (const environment of ["development", "staging", "production"]) {
      const suffix = environment === "development" ? "" : `:${environment}`;
      for (const command of ["db:migrate", "db:studio", "auth:create-admin"]) {
        const result = spawnSync(
          process.execPath,
          ["run", `${command}${suffix}`],
          { cwd: root, env, encoding: "utf-8", timeout: 10_000 }
        );
        expect(result.status, result.stderr).toBe(0);
        const variable =
          value === "turso"
            ? "TURSO_DATABASE_URL"
            : command === "auth:create-admin"
              ? "DATABASE_URL"
              : "DATABASE_URL_DIRECT";
        expect(JSON.parse(result.stdout)).toEqual({
          environment,
          credential: `${environment}-${variable}`,
        });
      }
    }
    delete env.DATABASE_URL_DIRECT_PRODUCTION;
    delete env.TURSO_DATABASE_URL_PRODUCTION;
    // Remove generated example placeholders so no file can supply missing credentials.
    await rm(join(root, ".env.local"));
    const missing = spawnSync(
      process.execPath,
      ["run", "db:migrate:production"],
      { cwd: root, env, encoding: "utf-8", timeout: 10_000 }
    );
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain(
      value === "turso"
        ? "Set TURSO_DATABASE_URL_PRODUCTION"
        : "Set DATABASE_URL_DIRECT_PRODUCTION"
    );
  }
);
