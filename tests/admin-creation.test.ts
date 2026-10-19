import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  generateInitialPassword,
  migrationCommand,
  checkAdminDatabase,
  createInitialAdmin,
} = await import(
  new URL("../catalog/auth/admin-creation.mjs", import.meta.url).href
);

test("initial passwords contain exactly 12 cryptographically generated URL-safe characters", () => {
  const passwords = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    const password = generateInitialPassword();
    expect(password).toMatch(/^[A-Za-z0-9_-]{12}$/u);
    passwords.add(password);
  }
  expect(passwords.size).toBe(100);
});

test.each(["development", "staging", "production"])(
  "missing schema in %s gives the matching migration command without SQL or credentials",
  async (environment) => {
    const suffix = environment === "development" ? "" : `:${environment}`;
    for (const cause of [
      { code: "42P01", message: "secret database URL" },
      { code: "42703", message: "private SQL parameters" },
      { message: "no such table: user" },
      { message: "no such column: banned" },
    ]) {
      const probe = async () => {
        throw new Error("SQL with private values", { cause });
      };
      await expect(
        checkAdminDatabase(probe, environment, "bun")
      ).rejects.toThrow(`"bun run db:migrate${suffix}"`);
      try {
        await checkAdminDatabase(probe, environment, "bun");
      } catch (error) {
        expect(String(error)).not.toMatch(/secret|private|banned|SQL/u);
      }
    }
    expect(migrationCommand(environment, "npm")).toBe(
      `npm run db:migrate${suffix}`
    );
  }
);

test("connection and permission failures never incorrectly suggest migrations", async () => {
  for (const code of ["ECONNREFUSED", "28P01", "42501", "ETIMEDOUT"]) {
    try {
      await checkAdminDatabase(
        async () => {
          throw Object.assign(new Error("postgres://private:secret@host/db"), {
            code,
          });
        },
        "production",
        "bun"
      );
      throw new Error("Expected database failure");
    } catch (error) {
      expect(String(error)).toContain(
        "connection, credentials and read permissions"
      );
      expect(String(error)).not.toMatch(/db:migrate|secret|postgres:/u);
    }
  }
});

const authFixture = (
  createUser: (input: { body: Record<string, string> }) => Promise<unknown>
) => ({
  $context: Promise.resolve({
    password: { config: { minPasswordLength: 8, maxPasswordLength: 128 } },
  }),
  api: { createUser },
});

test("creation delegates hashing and role assignment to Better Auth and returns password only on success", async () => {
  let submitted: Record<string, string> = {};
  const auth = authFixture(async ({ body }) => {
    submitted = body;
    return { user: { email: body.email } };
  });
  const result = await createInitialAdmin(auth, "Alex", "alex@example.com");
  expect(submitted).toEqual({
    name: "Alex",
    email: "alex@example.com",
    password: result.password,
    role: "admin",
  });
  expect(result.password).toHaveLength(12);
});

test("duplicate users and failed writes do not expose initial passwords or overwrite existing accounts", async () => {
  const duplicate = authFixture(async () => {
    throw Object.assign(new Error("Duplicate"), {
      body: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
  });
  await expect(
    createInitialAdmin(duplicate, "Alex", "alex@example.com")
  ).rejects.toThrow("password and permissions were not changed");
  const failed = authFixture(async ({ body }) => {
    throw new Error(`SQL INSERT password=${body.password} credential=private`);
  });
  await expect(
    createInitialAdmin(failed, "Alex", "alex@example.com")
  ).rejects.toThrow("interrupted write may have created the account");
  try {
    await createInitialAdmin(failed, "Alex", "alex@example.com");
  } catch (error) {
    expect(String(error)).not.toMatch(/SQL|credential=|password=/u);
  }
});

test("a customized password policy incompatible with 12 characters fails before writing", async () => {
  let writes = 0;
  const auth = authFixture(async () => {
    writes += 1;
    return {};
  });
  auth.$context = Promise.resolve({
    password: { config: { minPasswordLength: 16, maxPasswordLength: 128 } },
  });
  await expect(
    createInitialAdmin(auth, "Alex", "alex@example.com")
  ).rejects.toThrow("12-character");
  expect(writes).toBe(0);
});

test.each([
  "success",
  "missing",
  "connection",
  "cancel",
  "duplicate",
  "redirected",
])(
  "interactive admin command handles %s without leaking failed credentials",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "dinvolt-admin-cli-"));
    try {
      await mkdir(join(root, ".dinvolt"));
      await writeFile(
        join(root, ".dinvolt/config.json"),
        JSON.stringify({ packageManager: "bun" })
      );
      for (const filename of ["create-admin.mjs", "admin-creation.mjs"]) {
        await writeFile(
          join(root, filename),
          await readFile(
            new URL(`../catalog/auth/${filename}`, import.meta.url)
          )
        );
      }
      for (const name of ["jiti", "@clack/prompts"]) {
        await mkdir(join(root, "node_modules", name), { recursive: true });
        await writeFile(
          join(root, "node_modules", name, "package.json"),
          JSON.stringify({ name, type: "module", main: "index.js" })
        );
        await writeFile(
          join(root, "node_modules", name, "index.js"),
          "export {};"
        );
      }
      const script = join(root, "create-admin.mjs");
      const result = spawnSync(
        process.execPath,
        [
          "-e",
          `
        import { mock } from "bun:test";
        const scenario = ${JSON.stringify(scenario)};
        process.argv = ["node", "create-admin.mjs"];
        Object.defineProperty(process.stdin, "isTTY", { value: true });
        Object.defineProperty(process.stdout, "isTTY", { value: scenario !== "redirected" });
        process.env.BETTER_AUTH_URL = "https://admin:secret@app.example.com/?token=private";
        let prompts = 0, writes = 0, checks = 0;
        const cancel = Symbol("cancel");
        mock.module("@clack/prompts", () => ({
          isCancel: value => value === cancel,
          text: async () => { prompts++; return scenario === "cancel" ? cancel : prompts === 1 ? " Alex " : " ALEX@example.com "; }
        }));
        mock.module("jiti", () => ({ createJiti: () => ({ import: async () => ({ bootstrap: {
          getDatabaseEnvironment: () => "production",
          checkDatabase: async () => {
            checks++;
            if (scenario === "missing") throw new Error("no such column: secret");
            if (scenario === "connection") throw new Error("network secret");
          },
          auth: {
            $context: Promise.resolve({ password: { config: { minPasswordLength: 8, maxPasswordLength: 128 } } }),
            api: { createUser: async ({body}) => {
              writes++;
              if (scenario === "duplicate") throw Object.assign(new Error("private " + body.password), { body: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" } });
              if (body.name !== "Alex" || body.email !== "alex@example.com" || body.password.length !== 12 || body.role !== "admin") throw new Error("Invalid creation");
              return { user: { email: body.email } };
            } }
          }
        } }) }) }));
        await import(${JSON.stringify(script)});
        console.log(JSON.stringify({prompts,writes,checks}));
      `,
        ],
        { cwd: root, encoding: "utf-8", timeout: 10_000 }
      );
      expect(result.stdout + result.stderr).not.toMatch(
        /secret|token=private|private /u
      );
      expect(result.stdout.length, result.stderr).toBeGreaterThan(0);
      const counts = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
      if (scenario === "success") {
        expect(result.status).toBe(0);
        expect(counts).toEqual({ prompts: 2, writes: 1, checks: 1 });
        expect(result.stdout).toMatch(/Initial password: [A-Za-z0-9_-]{12}\n/u);
        expect(result.stdout).toContain(
          "Admin panel: https://app.example.com/admin"
        );
      } else {
        expect(result.stdout).not.toContain("Initial password:");
        expect(result.status).toBe(scenario === "cancel" ? 0 : 1);
        expect(counts.writes).toBe(scenario === "duplicate" ? 1 : 0);
        if (scenario === "missing") {
          expect(result.stderr).toContain("bun run db:migrate:production");
        }
        if (["connection", "missing", "redirected"].includes(scenario)) {
          expect(counts.prompts).toBe(0);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
);

test("first administrator policy skips existing admins and rechecks before writes", async () => {
  const { createFirstAdmin } = await import(
    new URL("../catalog/auth/admin-creation.mjs", import.meta.url).href
  );
  let writes = 0;
  let checks = 0;
  let existing = true;
  const bootstrap = {
    getDatabaseEnvironment: () => "development",
    checkDatabase: async () => {
      checks += 1;
    },
    hasAdministrator: async () => existing,
    auth: authFixture(async ({ body }) => {
      writes += 1;
      return { user: { email: body.email } };
    }),
  };
  expect(
    await createFirstAdmin(bootstrap, "Test", "test@example.com", "bun")
  ).toEqual({ status: "existing" });
  expect(writes).toBe(0);
  existing = false;
  const first = await createFirstAdmin(
    bootstrap,
    "Test",
    "test@example.com",
    "bun"
  );
  const second = await createFirstAdmin(
    bootstrap,
    "Test",
    "other@example.com",
    "bun"
  );
  expect(first.password).toHaveLength(12);
  expect(second.password).toHaveLength(12);
  expect(first.password).not.toBe(second.password);
  expect(checks).toBe(3);
  expect(writes).toBe(2);
  bootstrap.auth = authFixture(async () => {
    throw Object.assign(new Error("private"), {
      body: { code: "USER_ALREADY_EXISTS" },
    });
  });
  await expect(
    createFirstAdmin(bootstrap, "Test", "duplicate@example.com", "bun")
  ).rejects.toThrow("password and permissions were not changed");
});
