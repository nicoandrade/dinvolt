import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNextProject } from "../src/create.ts";
import { databaseConnectionSummary } from "../src/database-connections.ts";
import {
  initializeDatabaseConnection,
  initializeDatabaseConnections,
} from "../src/database-initialization.ts";

const {
  initialSchema,
  initializeInitialDatabase,
  inspectInitialDatabase,
  migrationDigest,
  verifyInitialAuthSchema,
} = await import(
  new URL("../catalog/database/initial-schema.mjs", import.meta.url).href
);
const migration = {
  hash: "fixture-hash",
  folderMillis: 1_792_375_200_000,
  name: "20261019000000_dinvolt_initial",
  sql: [
    "CREATE TABLE \"user\" (id text PRIMARY KEY, email text NOT NULL UNIQUE, role text DEFAULT 'user')",
    'CREATE TABLE "account" (id text PRIMARY KEY, user_id text REFERENCES "user"(id) ON DELETE CASCADE)',
    'CREATE TABLE "session" (id text PRIMARY KEY, token text NOT NULL UNIQUE)',
    'CREATE TABLE "verification" (id text PRIMARY KEY, value text NOT NULL)',
    'CREATE INDEX "account_user_idx" ON "account" (user_id)',
  ],
};
const initial = {
  ...migration,
  schema: await initialSchema("turso", migration),
};
const fixture = () => {
  const db = new Database(":memory:");
  const queries: string[] = [];
  const query = async (sql: string, args: string[] = []) => {
    queries.push(sql);
    return db.query(sql).all(...args);
  };
  const adapter = {
    query,
    transaction: async (
      action: (execute: typeof query) => Promise<unknown>
    ) => {
      await query("BEGIN IMMEDIATE");
      try {
        const result = await action(query);
        await query("COMMIT");
        return result;
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
    },
    close: async () => {
      /* Keep this isolated fixture open for persisted assertions. */
    },
  };
  return { db, queries, adapter };
};

test("Turso default and rowid serialization matches SQLite while default drift remains incompatible", async () => {
  const { db, adapter } = fixture();
  const schemaMigration = {
    ...migration,
    sql: migration.sql.map((sql) =>
      sql.startsWith('CREATE TABLE "user"')
        ? `CREATE TABLE "user" (id text PRIMARY KEY, email text NOT NULL UNIQUE, role text DEFAULT 'Admin', banned integer DEFAULT false, created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)))`
        : sql
    ),
  };
  try {
    const expected = { schema: await initialSchema("turso", schemaMigration) };
    for (const sql of schemaMigration.sql) {
      await adapter.query(sql);
    }
    let drift = false;
    const remoteQuery = async (sql: string) => {
      const rows = (await adapter.query(sql)) as Record<string, unknown>[];
      return rows.map((row) => {
        if (sql.startsWith("PRAGMA index_xinfo") && row.cid === -1) {
          return { ...row, name: "" };
        }
        if (sql.startsWith("PRAGMA table_xinfo")) {
          if (row.name === "created_at") {
            return {
              ...row,
              dflt_value: "((CAST(unixepoch('subsecond') * 1000 AS integer)))",
            };
          }
          if (row.name === "banned") {
            return { ...row, dflt_value: "FALSE" };
          }
          if (row.name === "role") {
            return { ...row, dflt_value: drift ? "'admin'" : "('Admin')" };
          }
        }
        return row;
      });
    };
    expect(await verifyInitialAuthSchema(remoteQuery, "turso", expected)).toBe(
      true
    );
    drift = true;
    expect(await verifyInitialAuthSchema(remoteQuery, "turso", expected)).toBe(
      false
    );
  } finally {
    db.close();
  }
});

test("empty SQLite database initializes transactionally, and retries preserve rows and one genuine migration", async () => {
  const { db, adapter, queries } = fixture();
  try {
    expect(
      await initializeInitialDatabase(adapter, "turso", initial, migration)
    ).toEqual({ connected: true, status: "initialized" });
    await adapter.query(
      "INSERT INTO \"user\" (id, email) VALUES ('test', 'fixture@example.com')"
    );
    queries.length = 0;
    expect(
      await initializeInitialDatabase(adapter, "turso", initial, migration)
    ).toEqual({ connected: true, status: "ready" });
    expect(await adapter.query('SELECT id FROM "user"')).toEqual([
      { id: "test" },
    ]);
    expect(
      await adapter.query("SELECT hash, name FROM __drizzle_migrations")
    ).toEqual([{ hash: migration.hash, name: migration.name }]);
    expect(
      queries.some((sql) => /^(?:CREATE|INSERT INTO "__drizzle)/u.test(sql))
    ).toBe(false);
  } finally {
    db.close();
  }
});

test("same table names, matching schema without history, changed constraints and drift never get silently adopted", async () => {
  const mutations = [
    async (query: (sql: string) => Promise<unknown>) => {
      await query('CREATE TABLE "user" (id integer)');
    },
    async (query: (sql: string) => Promise<unknown>) => {
      for (const sql of migration.sql) {
        await query(sql);
      }
    },
  ];
  // Inspect two unknown starting states and multiple genuine-history drift cases.
  for (const setup of mutations.slice(0, 2)) {
    const { db, adapter, queries } = fixture();
    try {
      await setup(adapter.query);
      queries.length = 0;
      expect(
        await initializeInitialDatabase(adapter, "turso", initial, migration)
      ).toEqual({ connected: true, status: "incompatible" });
      expect(
        queries.some((sql) => /^(?:CREATE|INSERT|DROP|ALTER)/u.test(sql))
      ).toBe(false);
    } finally {
      db.close();
    }
  }
  for (const sql of [
    "DROP INDEX account_user_idx",
    'ALTER TABLE "user" ADD COLUMN private_data text',
    'CREATE TRIGGER extra AFTER INSERT ON "user" BEGIN SELECT 1; END',
    "UPDATE __drizzle_migrations SET hash='unknown'",
    'ALTER TABLE "account" RENAME TO unrelated',
  ]) {
    const { db, adapter } = fixture();
    try {
      await initializeInitialDatabase(adapter, "turso", initial, migration);
      await adapter.query(sql);
      expect(
        await inspectInitialDatabase(adapter.query, "turso", initial)
      ).toBe("incompatible");
    } finally {
      db.close();
    }
  }
});

test("partial application rolls back DDL and history, remains retryable, and errors do not leak SQL", async () => {
  const { db, adapter } = fixture();
  try {
    const failure = {
      ...migration,
      sql: [...migration.sql.slice(0, 2), "INVALID SQL secret=token"],
    };
    expect(
      await initializeInitialDatabase(adapter, "turso", initial, failure)
    ).toEqual({ connected: true, status: "failed" });
    expect(await adapter.query("SELECT name FROM sqlite_master")).toEqual([]);
    expect(
      await initializeInitialDatabase(adapter, "turso", initial, migration)
    ).toEqual({ connected: true, status: "initialized" });
  } finally {
    db.close();
  }
});

test("connection and write-permission failures are distinct from ready schema and use fixed diagnostics", async () => {
  const { db, adapter } = fixture();
  try {
    await adapter.query("PRAGMA query_only=ON");
    expect(
      await initializeInitialDatabase(adapter, "turso", initial, migration)
    ).toEqual({ connected: true, status: "failed" });
    expect(await adapter.query("SELECT name FROM sqlite_master")).toEqual([]);
    const query = async () => {
      throw new Error(`private URL and SQL ${db.filename}`);
    };
    expect(
      await initializeInitialDatabase(
        { ...adapter, query },
        "turso",
        initial,
        migration
      )
    ).toEqual({ connected: false, status: "failed" });
  } finally {
    db.close();
  }
});

test("multiple environments are sequential, share the initial migration and skip missing credentials", async () => {
  const a = fixture();
  const b = fixture();
  const events: string[] = [];
  try {
    const connections = [
      {
        environment: "development" as const,
        credentials: { TURSO_AUTH_TOKEN: "a" },
      },
      {
        environment: "staging" as const,
        credentials: { TURSO_AUTH_TOKEN: "b" },
      },
      {
        environment: "production" as const,
        credentials: { TURSO_AUTH_TOKEN: "a" },
      },
    ];
    const results = await initializeDatabaseConnections(
      "/fixture",
      connections,
      async (_, connection) => {
        events.push(`start:${connection.environment}`);
        const result = await initializeInitialDatabase(
          connection.credentials?.TURSO_AUTH_TOKEN === "a"
            ? a.adapter
            : b.adapter,
          "turso",
          initial,
          migration
        );
        events.push(`end:${connection.environment}`);
        return { environment: connection.environment, ...result };
      }
    );
    expect(results.map((result) => result.status)).toEqual([
      "initialized",
      "initialized",
      "ready",
    ]);
    expect(events).toEqual([
      "start:development",
      "end:development",
      "start:staging",
      "end:staging",
      "start:production",
      "end:production",
    ]);
    expect(
      await initializeDatabaseConnections(
        "/fixture",
        [{ environment: "staging" }],
        async () => {
          throw new Error("No process expected");
        }
      )
    ).toEqual([
      {
        environment: "staging",
        connected: false,
        status: "credentials-pending",
      },
    ]);
  } finally {
    a.db.close();
    b.db.close();
  }
});

test("failed remote workers run after project persistence and keep credentials/migrations without exposing diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-init-preserve-"));
  try {
    const project = await createNextProject(
      root,
      "preserved",
      "new",
      async (directory) => {
        await mkdir(join(directory, "scripts"), { recursive: true });
        await mkdir(join(directory, "drizzle"));
        await writeFile(join(directory, ".env.local"), "PRIVATE=preserved\n", {
          mode: 0o600,
        });
        await writeFile(
          join(directory, "drizzle", "migration.sql"),
          "CREATE TABLE fixture(id text)"
        );
        await writeFile(
          join(directory, "scripts", "initialize-database.mjs"),
          "console.error('secret SQL token');process.exit(1)"
        );
      }
    );
    const connections = [
      {
        environment: "staging" as const,
        credentials: { TURSO_AUTH_TOKEN: "secret-token" },
      },
    ];
    const results = await initializeDatabaseConnections(
      project.path,
      connections
    );
    expect(results).toEqual([
      { environment: "staging", status: "failed", connected: false },
    ]);
    expect(await readFile(join(project.path, ".env.local"), "utf-8")).toBe(
      "PRIVATE=preserved\n"
    );
    expect(
      await readFile(join(project.path, "drizzle", "migration.sql"), "utf-8")
    ).toContain("CREATE TABLE");
    const summary = databaseConnectionSummary(connections, "bun", results);
    expect(summary).toContain("staging: Initialization failed");
    expect(summary).toContain("bun run db:init:staging");
    expect(summary).not.toMatch(/secret|token|SQL/u);
    expect(
      await initializeDatabaseConnection(join(root, "missing"), connections[0]!)
    ).toEqual(results[0]!);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine metadata is accepted only by exact definition and unknown empty migration-history structures are never adopted", async () => {
  for (const sql of [
    "CREATE TABLE __turso_internal_mvcc_meta (k TEXT, v INTEGER NOT NULL)",
    "CREATE TABLE __turso_internal_mvcc_meta (private_data TEXT)",
    "CREATE TABLE __drizzle_migrations (hash text, created_at numeric, name text, extra text)",
  ]) {
    const { db, adapter, queries } = fixture();
    try {
      await adapter.query(sql);
      queries.length = 0;
      const result = await initializeInitialDatabase(
        adapter,
        "turso",
        initial,
        migration
      );
      expect(result.status).toBe(
        sql.includes("v INTEGER") ? "initialized" : "incompatible"
      );
      if (result.status === "incompatible") {
        expect(
          queries.some((query) => /^(?:CREATE|INSERT|DROP|ALTER)/u.test(query))
        ).toBe(false);
      }
    } finally {
      db.close();
    }
  }
});

test("one environment's partial failure preserves completed destinations and lets later environments continue", async () => {
  const successful = fixture();
  const partial = fixture();
  try {
    const connections = ["development", "staging", "production"].map(
      (environment) => ({
        environment: environment as "development" | "staging" | "production",
        credentials: { TURSO_AUTH_TOKEN: environment },
      })
    );
    const results = await initializeDatabaseConnections(
      "/fixture",
      connections,
      async (_, connection) => {
        const result = await initializeInitialDatabase(
          connection.environment === "staging"
            ? partial.adapter
            : successful.adapter,
          "turso",
          initial,
          connection.environment === "staging"
            ? {
                ...migration,
                sql: [...migration.sql.slice(0, 2), "INVALID SQL"],
              }
            : migration
        );
        return { ...result, environment: connection.environment };
      }
    );
    expect(results.map((result) => result.status)).toEqual([
      "initialized",
      "failed",
      "ready",
    ]);
    expect(
      await inspectInitialDatabase(successful.adapter.query, "turso", initial)
    ).toBe("ready");
    expect(
      await inspectInitialDatabase(partial.adapter.query, "turso", initial)
    ).toBe("empty");
  } finally {
    successful.db.close();
    partial.db.close();
  }
});

test("generated worker refuses later schema or SQL changes before opening any database", async () => {
  const { createHash } = await import("node:crypto");
  const { copyFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "dinvolt-schema-guard-"));
  try {
    for (const directory of [
      ".dinvolt",
      "scripts",
      "src/db",
      "node_modules/drizzle-orm",
    ]) {
      await mkdir(join(root, directory), { recursive: true });
    }
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      join(root, "node_modules/drizzle-orm/package.json"),
      '{"type":"module","exports":{"./migrator":"./migrator.js"}}'
    );
    await writeFile(
      join(root, "node_modules/drizzle-orm/migrator.js"),
      `export const readMigrationFiles=()=>[${JSON.stringify(migration)}];`
    );
    await writeFile(
      join(root, ".dinvolt/config.json"),
      '{"database":{"provider":"turso","environments":["development"]}}'
    );
    for (const file of ["initialize-database.mjs", "initial-schema.mjs"]) {
      await copyFile(
        new URL(`../catalog/database/${file}`, import.meta.url),
        join(root, "scripts", file)
      );
    }
    await writeFile(
      join(root, "scripts/initial-driver.mjs"),
      'export const initialAdapter=()=>{throw new Error("Database must never be opened")}'
    );
    for (const file of ["schema.ts", "auth-schema.ts"]) {
      await writeFile(join(root, "src/db", file), "original schema\n");
    }
    const digest = createHash("sha256")
      .update("original schema\n")
      .digest("hex");
    const metadata = {
      ...initial,
      provider: "turso",
      digest: migrationDigest(migration),
      sourceHashes: {
        "src/db/schema.ts": digest,
        "src/db/auth-schema.ts": digest,
      },
    };
    await writeFile(
      join(root, ".dinvolt/initial-database.json"),
      JSON.stringify(metadata)
    );
    await writeFile(join(root, "src/db/schema.ts"), "changed schema\n");
    const result = await initializeDatabaseConnection(root, {
      environment: "development",
      credentials: {
        TURSO_DATABASE_URL: "turso://unused.example.com",
        TURSO_AUTH_TOKEN: "private",
      },
    });
    expect(result).toEqual({
      environment: "development",
      connected: false,
      status: "review-required",
    });
    expect(
      databaseConnectionSummary([{ environment: "development" }], "bun", [
        result,
      ])
    ).toContain("\n  bun run db:migrate");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PostgreSQL schema equality survives formatter/driver key ordering without accepting actual drift", async () => {
  const schema = [{ definition: "r:false:false", name: "user", kind: "table" }];
  const query = async (sql: string) => {
    if (sql.includes("SELECT 'table' AS kind")) {
      return [{ kind: "table", name: "user", definition: "r:false:false" }];
    }
    if (sql.includes("to_regclass")) {
      return [{ name: "drizzle.__drizzle_migrations" }];
    }
    if (sql.includes("information_schema.columns")) {
      return [
        {
          type: "integer",
          name: "id",
          nullable: "NO",
          default: "nextval('drizzle.__drizzle_migrations_id_seq'::regclass)",
        },
        { type: "text", name: "hash", nullable: "NO", default: null },
        { type: "bigint", name: "created_at", nullable: "YES", default: null },
      ];
    }
    if (sql.includes("SELECT hash, created_at")) {
      return [{ hash: initial.hash, created_at: initial.folderMillis }];
    }
    throw new Error("Unexpected schema query");
  };
  expect(
    await inspectInitialDatabase(query, "planetscale-postgres", {
      ...initial,
      schema,
    })
  ).toBe("ready");
  expect(
    await inspectInitialDatabase(query, "planetscale-postgres", {
      ...initial,
      schema: [{ ...schema[0], definition: "r:true:false" }],
    })
  ).toBe("incompatible");
});
