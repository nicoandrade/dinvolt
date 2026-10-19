import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";

import { createNextProject } from "../src/create.ts";
import {
  configureDatabaseConnections,
  connectionFields,
  credentialError,
  databaseConnectionSummary,
  saveDatabaseConnections,
  serializeCredential,
  verifyDatabaseConnection,
} from "../src/database-connections.ts";
import type {
  ConnectionPrompts,
  ConnectionRequest,
  DatabaseCredentials,
} from "../src/database-connections.ts";
import { databaseEnvironments } from "../src/database.ts";
import { CancelledError } from "../src/wizard-prompts.ts";

const require = createRequire(import.meta.url);
const directories: string[] = [];
const turso = {
  TURSO_DATABASE_URL: "turso://example.turso.io",
  TURSO_AUTH_TOKEN: "fixture-token",
};
const postgres = {
  DATABASE_URL:
    "postgresql://app:password@branch.horizon.psdb.cloud:6432/db?sslmode=verify-full",
  DATABASE_URL_DIRECT:
    "postgresql://migration:password@branch.horizon.psdb.cloud:5432/db?sslmode=verify-full",
};

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-connections-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function promptFixture(values: DatabaseCredentials = turso) {
  const fields: string[] = [];
  const failures: string[] = [];
  const prompts: ConnectionPrompts = {
    configureNow: async () => true,
    credential: async (context, field, variable) => {
      fields.push(`${context} ${variable}`);
      return values[field.name]!;
    },
    failure: async (context, field) => {
      failures.push(`${context} ${field}`);
      return "skip";
    },
    verify: async (_, action) => await action(),
  };
  return { prompts, fields, failures };
}

test("skip needs no credentials or connection and preserves the selected environments", async () => {
  const { prompts } = promptFixture();
  prompts.configureNow = async (label, environments) => {
    expect(label).toBe("Turso Database");
    expect(environments).toEqual(["development"]);
    return false;
  };
  prompts.credential = async () => {
    throw new Error("No credential prompt expected");
  };
  const result = await configureDatabaseConnections(
    "turso",
    ["development"],
    prompts,
    async () => {
      throw new Error("No network expected");
    }
  );
  expect(result).toEqual([{ environment: "development" }]);
  const directory = await fixture();
  await saveDatabaseConnections(directory, result);
  expect(await readdir(directory)).toEqual([]);
});

test.each(["turso", "planetscale-postgres"] as const)(
  "%s labels and variables follow every nonempty environment combination",
  async (provider) => {
    for (let mask = 1; mask < 8; mask += 1) {
      const environments = databaseEnvironments.filter(
        (_, index) => Math.floor(mask / 2 ** index) % 2 === 1
      );
      const values = provider === "turso" ? turso : postgres;
      const { prompts, fields } = promptFixture(values);
      const result = await configureDatabaseConnections(
        provider,
        environments.toReversed(),
        prompts,
        async (_, credentials) => {
          expect(credentials).toEqual(values);
        }
      );
      expect(result).toEqual(
        environments.map((environment) => ({
          environment,
          credentials: values,
        }))
      );
      for (const environment of environments) {
        for (const { name } of connectionFields(provider)) {
          expect(fields).toContain(
            `${provider === "turso" ? "Turso Database" : "PostgreSQL on PlanetScale"} · ${environment} ${name}${environment === "development" ? "" : `_${environment.toUpperCase()}`}`
          );
        }
      }
      const summary = databaseConnectionSummary(result, "npm");
      for (const environment of databaseEnvironments) {
        expect(
          summary.includes(
            `npm run db:init${environment === "development" ? "\n" : `:${environment}`}`
          )
        ).toBe(environments.includes(environment));
      }
      expect(summary).not.toContain("password");
      expect(summary).not.toContain("fixture-token");
      expect(summary).toContain("only the unchanged initial migration");
    }
  }
);

test("a driver failure can be retried, corrected or discarded per environment without leaking values", async () => {
  const { prompts, fields, failures } = promptFixture();
  const actions = ["retry", "edit", "skip"] as const;
  let attempts = 0;
  let failuresSeen = 0;
  prompts.failure = async (context, field) => {
    failures.push(`${context} ${field}`);
    const action = actions[failuresSeen]!;
    failuresSeen += 1;
    return action;
  };
  const result = await configureDatabaseConnections(
    "turso",
    ["staging", "production"],
    prompts,
    async () => {
      attempts += 1;
      if (attempts <= 3) {
        throw new Error(JSON.stringify(turso));
      }
    }
  );
  expect(attempts).toBe(4);
  expect(fields.filter((field) => field.includes("staging"))).toHaveLength(4);
  expect(result).toEqual([
    { environment: "staging" },
    { environment: "production", credentials: turso },
  ]);
  expect(JSON.stringify(failures)).not.toContain(turso.TURSO_AUTH_TOKEN);
  expect(databaseConnectionSummary(result, "bun")).toContain(
    "staging: Credentials pending"
  );
});

test("cancel from setup, a credential or failure prompt aborts without writing files", async () => {
  const directory = await fixture();
  for (const phase of ["configureNow", "credential", "failure"] as const) {
    const { prompts } = promptFixture();
    prompts[phase] = async () => {
      throw new CancelledError();
    };
    await expect(
      configureDatabaseConnections(
        "turso",
        ["development"],
        prompts,
        async () => ({ field: "TURSO_DATABASE_URL" })
      )
    ).rejects.toBeInstanceOf(CancelledError);
    expect(await readdir(directory)).toEqual([]);
  }
});

test("invalid URL formats, incomplete identities, unsafe dotenv input and TLS overrides are rejected safely", () => {
  const invalid: [Parameters<typeof credentialError>[0], string][] = [
    ["TURSO_DATABASE_URL", "file:local.db"],
    ["TURSO_DATABASE_URL", "http://localhost:8080"],
    ["TURSO_DATABASE_URL", "https://user:secret@example.com"],
    ["TURSO_DATABASE_URL", "turso://example.com/path"],
    ["TURSO_AUTH_TOKEN", "token\nNEW_KEY=secret"],
    ["TURSO_AUTH_TOKEN", "token\u0000secret"],
    ["TURSO_AUTH_TOKEN", "token'quoted"],
    ["TURSO_AUTH_TOKEN", "token\\escaped"],
    ["DATABASE_URL", "postgresql://user@host:6432/db?sslmode=verify-full"],
    ["DATABASE_URL", postgres.DATABASE_URL.replace("verify-full", "disable")],
    ["DATABASE_URL_DIRECT", postgres.DATABASE_URL],
    ["DATABASE_URL", `${postgres.DATABASE_URL}&host=other`],
    ["DATABASE_URL", postgres.DATABASE_URL.replace("password", "%ZZ")],
  ];
  for (const [field, value] of invalid) {
    const error = credentialError(field, value);
    expect(error).toBeTypeOf("string");
    expect(error).not.toContain(value);
  }
  for (const values of [turso, postgres]) {
    for (const [field, value] of Object.entries(values)) {
      expect(
        credentialError(field as Parameters<typeof credentialError>[0], value)
      ).toBeUndefined();
    }
  }
});

const successResponse = () =>
  Response.json({
    baton: null,
    results: [
      {
        type: "ok",
        response: {
          type: "execute",
          result: { rows: [[{ type: "integer", value: "1" }]] },
        },
      },
      { type: "ok", response: { type: "close" } },
    ],
  });

test("Turso probe uses one read-only HTTP pipeline, closes the stream and never follows redirects", async () => {
  const request = (async (url, options) => {
    expect(String(url)).toBe("https://example.turso.io/v3/pipeline");
    expect(options?.redirect).toBe("error");
    expect(options?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${turso.TURSO_AUTH_TOKEN}`,
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      requests: [
        { type: "execute", stmt: { sql: "SELECT 1", want_rows: true } },
        { type: "close" },
      ],
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return successResponse();
  }) as ConnectionRequest;
  expect(
    await verifyDatabaseConnection("turso", turso, { request })
  ).toBeUndefined();
});

test("HTTP, protocol and driver exceptions return only a safe field identifier", async () => {
  for (const request of [
    async () => {
      throw new Error(JSON.stringify(turso));
    },
    async () => Response.json(turso, { status: 401 }),
    async () => Response.json({ results: [{ type: "error", error: turso }] }),
    async () => Response.json({}),
  ]) {
    expect(
      await verifyDatabaseConnection("turso", turso, {
        request: request as ConnectionRequest,
      })
    ).toEqual({ field: "TURSO_DATABASE_URL" });
  }
  let networkCalls = 0;
  expect(
    await verifyDatabaseConnection(
      "turso",
      { ...turso, TURSO_AUTH_TOKEN: "" },
      {
        request: (async () => {
          networkCalls += 1;
          return successResponse();
        }) as ConnectionRequest,
      }
    )
  ).toEqual({ field: "TURSO_AUTH_TOKEN" });
  expect(networkCalls).toBe(0);
});

test("Turso timeout aborts a real stalled HTTP request with no credentials in diagnostics", async () => {
  // Exercise native fetch cancellation through a local server; never send a
  // credential to the network in this unit test.
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response(new ReadableStream()),
  });
  try {
    const start = Date.now();
    const request = ((_, options) =>
      fetch(`http://127.0.0.1:${server.port}`, {
        signal: options?.signal,
      })) as ConnectionRequest;
    expect(
      await verifyDatabaseConnection("turso", turso, { timeout: 30, request })
    ).toEqual({ field: "TURSO_DATABASE_URL" });
    expect(Date.now() - start).toBeLessThan(2000);
  } finally {
    server.stop(true);
  }
});

test.each(["success", "connect", "query", "direct"] as const)(
  "PlanetScale checks both endpoints and releases resources on %s",
  async (failure) => {
    const events: string[] = [];
    const result = await verifyDatabaseConnection(
      "planetscale-postgres",
      postgres,
      {
        timeout: 123,
        poolFactory: (config) => {
          const label = config.port === 6432 ? "app" : "direct";
          expect(config.host).toBe("branch.horizon.psdb.cloud");
          expect(config.ssl).toEqual({ rejectUnauthorized: true });
          expect(config.connectionTimeoutMillis).toBe(123);
          expect(config.query_timeout).toBe(123);
          return {
            on() {
              return this;
            },
            async connect() {
              events.push(`${label}:connect`);
              if (
                failure === "connect" ||
                (failure === "direct" && label === "direct")
              ) {
                throw new Error(postgres.DATABASE_URL);
              }
              return {
                async query(sql) {
                  expect(sql).toBe("SELECT 1");
                  events.push(`${label}:query`);
                  if (failure === "query") {
                    throw new Error(postgres.DATABASE_URL);
                  }
                },
                release(destroy) {
                  expect(destroy).toBe(true);
                  events.push(`${label}:release`);
                },
              };
            },
            async end() {
              events.push(`${label}:end`);
            },
          };
        },
      }
    );
    expect(result).toEqual(
      failure === "success"
        ? undefined
        : {
            field:
              failure === "direct" ? "DATABASE_URL_DIRECT" : "DATABASE_URL",
          }
    );
    expect(events).toContain("app:end");
    if (failure !== "connect") {
      expect(events).toContain("app:release");
    }
    if (["success", "direct"].includes(failure)) {
      expect(events).toContain("direct:end");
    } else {
      expect(events).not.toContain("direct:connect");
    }
  }
);

test("PostgreSQL timeout closes a real stalled socket and returns sanitized failure", async () => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing test port");
  }
  try {
    const started = Date.now();
    const result = await verifyDatabaseConnection(
      "planetscale-postgres",
      postgres,
      {
        timeout: 40,
        poolFactory: (config) =>
          new Pool({ ...config, host: "127.0.0.1", port: address.port }),
      }
    );
    expect(result).toEqual({ field: "DATABASE_URL" });
    expect(Date.now() - started).toBeLessThan(2000);
    for (const socket of sockets) {
      socket.resume();
      if (!socket.destroyed) {
        await once(socket, "close");
      }
    }
    expect(sockets.size).toBe(0);
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }
    server.close();
  }
});

test("writes only connected credentials privately, preserving auth, unrelated multiline values and the example", async () => {
  const directory = await fixture();
  const original =
    "# Preserve me\nBETTER_AUTH_SECRET=generated-secret\nBETTER_AUTH_URL=https://test.localhost\nMAIL_KEY='first\nsecond'\nTURSO_AUTH_TOKEN=old\nTURSO_AUTH_TOKEN=duplicate\nTURSO_DATABASE_URL=turso://old\nOTHER=$UNCHANGED\n";
  await writeFile(join(directory, ".env.local"), original, { mode: 0o644 });
  await writeFile(
    join(directory, ".env.example"),
    "TURSO_AUTH_TOKEN=example\n"
  );
  await writeFile(join(directory, ".gitignore"), ".env.local\n");
  const credentials = {
    ...turso,
    // eslint-disable-next-line no-template-curly-in-string -- Test literal dotenv expansion syntax.
    TURSO_AUTH_TOKEN: "token$PATH${HOME}#=value",
  };
  await saveDatabaseConnections(directory, [
    { environment: "development", credentials },
    { environment: "staging" },
  ]);
  const source = await readFile(join(directory, ".env.local"), "utf-8");
  expect(source).toContain("MAIL_KEY='first\nsecond'");
  expect(source).toContain("BETTER_AUTH_SECRET=generated-secret");
  expect(source).toContain("OTHER=$UNCHANGED");
  expect(source).not.toContain("duplicate");
  expect(source).not.toContain("_STAGING");
  expect(await readFile(join(directory, ".env.example"), "utf-8")).toBe(
    "TURSO_AUTH_TOKEN=example\n"
  );
  expect((await stat(join(directory, ".env.local"))).mode % 512).toBe(0o600);
  expect((await readdir(directory)).toSorted()).toEqual([
    ".env.example",
    ".env.local",
    ".gitignore",
  ]);
  const result = spawnSync(
    "node",
    [
      "-e",
      "delete process.env.TURSO_AUTH_TOKEN;delete process.env.__NEXT_PROCESSED_ENV;process.env.NODE_ENV='development';const next=require(process.argv[1]);next.loadEnvConfig(process.cwd(),true,{info(){},error(){}});process.stdout.write(process.env.TURSO_AUTH_TOKEN)",
      require.resolve("@next/env"),
    ],
    { cwd: directory, encoding: "utf-8" }
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(credentials.TURSO_AUTH_TOKEN);
  expect(serializeCredential("#=$VALUE")).toBe("'#=\\$VALUE'");
});

test("creates an ignored private file when absent and cannot overwrite linked dotenv files", async () => {
  const directory = await fixture();
  await saveDatabaseConnections(directory, [
    { environment: "development", credentials: turso },
  ]);
  expect(await readFile(join(directory, ".gitignore"), "utf-8")).toContain(
    "/.env.local"
  );
  await rm(join(directory, ".env.local"));
  const outside = join(await fixture(), "private.env");
  await writeFile(outside, "keep");
  await symlink(outside, join(directory, ".env.local"));
  await expect(
    saveDatabaseConnections(directory, [
      { environment: "development", credentials: turso },
    ])
  ).rejects.toThrow("symbolic link");
  expect(await readFile(outside, "utf-8")).toBe("keep");
});

test("generation failure rolls back saved credentials and leaves an existing repository untouched", async () => {
  const directory = await fixture();
  const failure = new Error("Simulated later generation failure");
  await expect(
    createNextProject(directory, "rollback-probe", "new", async (path) => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path);
      await writeFile(
        join(path, ".env.local"),
        "BETTER_AUTH_SECRET=preserve\n"
      );
      await writeFile(join(path, ".gitignore"), ".env.local\n");
      await saveDatabaseConnections(path, [
        { environment: "production", credentials: turso },
      ]);
      expect(await readFile(join(path, ".env.local"), "utf-8")).toContain(
        "TURSO_AUTH_TOKEN_PRODUCTION"
      );
      throw failure;
    })
  ).rejects.toBe(failure);
  expect(await readdir(directory)).toEqual([]);
});
