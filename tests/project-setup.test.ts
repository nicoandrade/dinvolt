import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareAuthStarter } from "../src/auth.ts";
import { connectionFields } from "../src/database-connections.ts";
import { prepareDatabaseStarter } from "../src/database.ts";
import type { DatabaseProvider } from "../src/database.ts";
import {
  effectiveEnvironment,
  environmentDestination,
  mergeEnvironment,
  writePrivateEnvironment,
} from "../src/private-environment.ts";
import {
  addProjectEnvironments,
  findProject,
} from "../src/project-configuration.ts";
import {
  completeConnection,
  inspectConnections,
  setupExistingProject,
} from "../src/project-setup.ts";
import type { SetupPrompts } from "../src/project-setup.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const root of directories.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});
const temp = async () => {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-setup-"));
  directories.push(root);
  return root;
};
const credentials = (provider: DatabaseProvider) =>
  provider === "turso"
    ? {
        TURSO_DATABASE_URL: "turso://test.example.com",
        TURSO_AUTH_TOKEN: "private-token",
      }
    : {
        DATABASE_URL:
          "postgresql://user:password@test.example.com:6432/app?sslmode=verify-full",
        DATABASE_URL_DIRECT:
          "postgresql://user:password@test.example.com:5432/app?sslmode=verify-full",
      };
const fixture = async (
  provider: DatabaseProvider = "turso",
  publicOnly = false
) => {
  const root = await temp();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "setup-test",
      dependencies: { next: "16.4.2" },
      scripts: { dev: "next dev", custom: "echo preserved" },
    })
  );
  await mkdir(join(root, ".dinvolt"));
  if (!publicOnly) {
    await prepareDatabaseStarter(root, provider);
    await prepareAuthStarter(root, provider);
    await writeFile(join(root, ".dinvolt/initial-database.json"), "{}");
  }
  await writeFile(
    join(root, ".dinvolt/config.json"),
    JSON.stringify({
      schemaVersion: 1,
      projectType: publicOnly ? "public" : "public-admin",
      packageManager: "bun",
      custom: { preserve: true },
      ...(publicOnly
        ? {}
        : {
            database: {
              provider,
              orm: "drizzle",
              environments: ["development"],
            },
            auth: { provider: "better-auth", plugins: ["admin"] },
          }),
    })
  );
  return root;
};
const ui = (overrides: Partial<SetupPrompts> = {}): SetupPrompts => ({
  action: async () => {},
  privateFile: async () => true,
  report: () => {},
  connection: {
    configureNow: async () => true,
    credential: async () => {
      throw new Error("Unexpected credential prompt");
    },
    failure: async () => "skip",
    verify: async (_, action) => action(),
  },
  ...overrides,
});

test("public setup finds nested roots and completes without loading nonexistent helpers or adding capabilities", async () => {
  const root = await fixture("turso", true);
  await mkdir(join(root, "src/nested"), { recursive: true });
  const before = await readdir(root);
  const reports: string[] = [];
  await setupExistingProject(
    join(root, "src/nested"),
    ui({
      action: async () => {
        throw new Error("No setup questions for public");
      },
      report: (message) => reports.push(message),
    }),
    {
      initialize: async () => {
        throw new Error("No public database");
      },
      administrator: async () => {
        throw new Error("No public admin");
      },
    }
  );
  expect(await readdir(root)).toEqual(before);
  expect(reports.join(",")).toContain("Public website only");
  expect((await findProject(root)).metadata.database).toBeUndefined();
});

test("missing, malformed, unsupported and inconsistent metadata fail before file changes", async () => {
  const root = await fixture("turso", true);
  for (const content of [
    "{",
    "null",
    JSON.stringify({ schemaVersion: 3 }),
    JSON.stringify({ schemaVersion: 1, packageManager: "bun" }),
    JSON.stringify({
      schemaVersion: 1,
      packageManager: "bun",
      projectType: "public",
      database: { provider: "invented" },
    }),
  ]) {
    await writeFile(join(root, ".dinvolt/config.json"), content);
    await expect(findProject(root)).rejects.toThrow();
    expect(await readFile(join(root, ".dinvolt/config.json"), "utf-8")).toBe(
      content
    );
  }
  await rm(join(root, ".dinvolt"), { recursive: true });
  await expect(findProject(root)).rejects.toThrow("No Dinvolt metadata");
});

test.each(["turso", "planetscale-postgres"] as const)(
  "%s adds environments repeatedly without replacing custom code, scripts, lockfile, secret or metadata",
  async (provider) => {
    const root = await fixture(provider);
    const project = await findProject(root);
    const runtime = await readFile(
      join(root, "src/db/environment.ts"),
      "utf-8"
    );
    await writeFile(
      join(root, "src/db/environment.ts"),
      `${runtime}\n// My runtime customization\n`
    );
    await writeFile(join(root, "bun.lock"), "preserved lockfile");
    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf-8")
    );
    manifest.scripts["db:migrate:staging"] = "my-custom-migration-command";
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));
    const secret = await readFile(join(root, ".env.local"), "utf-8");
    await addProjectEnvironments(project, ["staging", "production"]);
    const once = await readFile(join(root, ".env.example"), "utf-8");
    await addProjectEnvironments(project, ["production", "staging"]);
    expect(await readFile(join(root, ".env.example"), "utf-8")).toBe(once);
    const updated = await findProject(root);
    expect(updated.metadata.database?.environments).toEqual([
      "development",
      "staging",
      "production",
    ]);
    expect(updated.metadata.custom).toEqual({ preserve: true });
    const script = JSON.parse(
      await readFile(join(root, "package.json"), "utf-8")
    ).scripts;
    expect(script["db:migrate:staging"]).toBe("my-custom-migration-command");
    expect(script["auth:create-admin:production"]).toContain("production");
    expect(script.custom).toBe("echo preserved");
    expect(
      await readFile(join(root, "src/db/environment.ts"), "utf-8")
    ).toContain("My runtime customization");
    expect(await readFile(join(root, "bun.lock"), "utf-8")).toBe(
      "preserved lockfile"
    );
    expect(await readFile(join(root, ".env.local"), "utf-8")).toBe(secret);
  }
);

test.each([".env", ".env.local", "both", "neither"])(
  "safe private dotenv writing with %s preserves unrelated values, comments, quotes and permissions",
  async (variant) => {
    const root = await temp();
    const original =
      "# my comment\nBETTER_AUTH_SECRET='keep-me'\nMAIL_KEY=\"line1\nline2\"\nTURSO_AUTH_TOKEN=old # token comment\nTURSO_AUTH_TOKEN=duplicate\n";
    if ([".env", "both"].includes(variant)) {
      await writeFile(join(root, ".env"), original);
    }
    if ([".env.local", "both"].includes(variant)) {
      await writeFile(join(root, ".env.local"), original);
    }
    const destination = await environmentDestination(root);
    expect(destination).toBe(variant === ".env" ? ".env" : ".env.local");
    await writePrivateEnvironment(
      root,
      new Map([["TURSO_AUTH_TOKEN", "'new-token'"]])
    );
    const actual = await readFile(join(root, destination), "utf-8");
    expect(actual.match(/TURSO_AUTH_TOKEN=/gu)).toHaveLength(1);
    if (variant !== "neither") {
      expect(actual).toContain("# token comment");
      expect(actual).toContain("BETTER_AUTH_SECRET='keep-me'");
      expect(actual).toContain('MAIL_KEY="line1\nline2"');
    }
    expect((await stat(join(root, destination))).mode % 0o1000).toBe(0o600);
    if (variant === "both") {
      expect(await readFile(join(root, ".env"), "utf-8")).toBe(original);
    }
  }
);

test("Next environment inspection obeys mode, expansion, inherited values, and does not modify the parent", async () => {
  const root = await temp();
  await writeFile(join(root, ".env"), "DINVOLT_TEST_PRECEDENCE=base\n");
  await writeFile(join(root, ".env.local"), "DINVOLT_TEST_PRECEDENCE=local\n");
  await writeFile(
    join(root, ".env.development.local"),
    "DINVOLT_TEST_PRECEDENCE=dev\nDINVOLT_TEST_LITERAL='hello\\$WORLD#='\n"
  );
  await writeFile(
    join(root, ".env.production.local"),
    "DINVOLT_TEST_PRECEDENCE=prod\n"
  );
  expect(
    await effectiveEnvironment(root, "development", [
      "DINVOLT_TEST_PRECEDENCE",
      "DINVOLT_TEST_LITERAL",
    ])
  ).toEqual({
    DINVOLT_TEST_PRECEDENCE: "dev",
    DINVOLT_TEST_LITERAL: "hello$WORLD#=",
  });
  expect(
    (await effectiveEnvironment(root, "staging", ["DINVOLT_TEST_PRECEDENCE"]))
      .DINVOLT_TEST_PRECEDENCE
  ).toBe("prod");
  expect(process.env.DINVOLT_TEST_PRECEDENCE).toBeUndefined();
  process.env.DINVOLT_TEST_PRECEDENCE = "inherited";
  try {
    expect(
      (
        await effectiveEnvironment(root, "production", [
          "DINVOLT_TEST_PRECEDENCE",
        ])
      ).DINVOLT_TEST_PRECEDENCE
    ).toBe("inherited");
  } finally {
    delete process.env.DINVOLT_TEST_PRECEDENCE;
  }
});

test.each(["turso", "planetscale-postgres"] as const)(
  "%s asks only missing fields, verifies existing values, saves selected env and skips invalid connection",
  async (provider) => {
    const root = await fixture(provider);
    const project = await findProject(root);
    const values = credentials(provider);
    const fields = connectionFields(provider);
    const calls: string[] = [];
    const form = ui();
    form.connection.credential = async (_, field) => {
      calls.push(field.name);
      return values[field.name as keyof typeof values] ?? "";
    };
    const partial = {
      [fields[0]!.name]: values[fields[0]!.name as keyof typeof values],
    };
    await writePrivateEnvironment(
      root,
      new Map([[fields[0]!.name, `'${partial[fields[0]!.name]}'`]])
    );
    calls.length = 0;
    const existing = await inspectConnections(project, async () => {});
    expect(existing.states[0]?.status).toBe("credentials-pending");
    const result = await completeConnection(
      project,
      existing.connections[0]!,
      form,
      async () => {}
    );
    expect(result?.connection.credentials).toEqual(values);
    expect(calls).toEqual([fields[1]!.name]);
    calls.length = 0;
    const valid = await inspectConnections(project, async () => {});
    expect(valid.states[0]?.status).toBe("connected");
    await completeConnection(
      project,
      valid.connections[0]!,
      form,
      async () => {}
    );
    expect(calls).toEqual([]);
    expect(
      await completeConnection(
        project,
        valid.connections[0]!,
        form,
        async () => ({ field: fields[0]!.name })
      )
    ).toBeUndefined();
  }
);

test("higher-priority/inherited overrides cannot cause validation and mutation against different databases", async () => {
  const root = await fixture();
  const project = await findProject(root);
  await writeFile(
    join(root, ".env.development.local"),
    "TURSO_AUTH_TOKEN=overriding\n"
  );
  const before = await readFile(join(root, ".env.local"), "utf-8");
  const form = ui();
  form.connection.credential = async (_, field) =>
    credentials("turso")[
      field.name as "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN"
    ] ?? "";
  expect(
    await completeConnection(
      project,
      { environment: "development" },
      form,
      async () => {}
    )
  ).toBeUndefined();
  expect(await readFile(join(root, ".env.local"), "utf-8")).toBe(before);
});

test("tracked dotenv is preserved and setup offers an ignored destination without altering Git history", async () => {
  const root = await fixture();
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "--force", ".env.local"], { cwd: root });
  const original = await readFile(join(root, ".env.local"), "utf-8");
  const form = ui();
  let offered = false;
  form.privateFile = async (tracked, alternative) => {
    expect(tracked).toBe(".env.local");
    expect(alternative).toBe(".env.development.local");
    offered = true;
    return true;
  };
  form.connection.credential = async (_, field) =>
    credentials("turso")[
      field.name as "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN"
    ] ?? "";
  const result = await completeConnection(
    await findProject(root),
    { environment: "development" },
    form,
    async () => {}
  );
  expect(offered).toBe(true);
  expect(result?.file).toBe(".env.development.local");
  expect(await readFile(join(root, ".env.local"), "utf-8")).toBe(original);
  execFileSync("git", ["check-ignore", "--quiet", ".env.development.local"], {
    cwd: root,
  });
  await expect(
    writePrivateEnvironment(
      root,
      new Map([["TOKEN", "'secret'"]]),
      ".env.local"
    )
  ).rejects.toThrow("tracked");
});

test("setup explains blocked initialization before returning to the menu and does not offer administrator creation", async () => {
  const root = await fixture();
  const reports: string[] = [];
  let actions = 0;
  const form = ui({
    action: async () => {
      actions += 1;
      if (actions === 1) {
        return { complete: ["development"] };
      }
      expect(reports.join("\n")).toContain(
        "unknown or incompatible schema/history"
      );
      expect(reports.join("\n")).toContain("administrator creation is blocked");
    },
    report: (message) => reports.push(message),
  });
  form.connection.credential = async (_, field) =>
    credentials("turso")[
      field.name as "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN"
    ]!;
  await setupExistingProject(root, form, {
    verify: async () => {},
    initialize: async () => [
      { environment: "development", connected: true, status: "incompatible" },
    ],
    administrator: async (_, connections) => {
      expect(connections).toEqual([]);
    },
  });
  expect(actions).toBe(2);
  expect(reports.join("\n")).not.toContain("private-token");
});

test("cancel after environment enablement preserves edits, and selection initializes sequentially with safe summary", async () => {
  const root = await fixture();
  let actions = 0;
  const form = ui({
    action: async () => {
      actions += 1;
      if (actions === 1) {
        return { add: ["staging", "production"] };
      }
      if (actions === 2) {
        return { complete: ["development", "staging"] };
      }
      throw new Error("Cancelled");
    },
  });
  form.connection.credential = async (environment, field) =>
    field.name === "TURSO_DATABASE_URL"
      ? `turso://${environment}.example.com`
      : `private-${environment}`;
  const initialized: string[] = [];
  await expect(
    setupExistingProject(root, form, {
      verify: async () => {},
      initialize: async (_, connections) => {
        const [connection] = connections;
        initialized.push(connection!.environment);
        return [
          {
            environment: connection!.environment,
            connected: true,
            status: "ready",
          },
        ];
      },
      administrator: async () => {},
    })
  ).rejects.toThrow("Cancelled");
  expect(initialized).toEqual(["development", "staging"]);
  const effective = await effectiveEnvironment(root, "staging", [
    "TURSO_AUTH_TOKEN_STAGING",
  ]);
  expect(effective.TURSO_AUTH_TOKEN_STAGING).toBe("private-staging");
  expect((await findProject(root)).metadata.database?.environments).toEqual([
    "development",
    "staging",
    "production",
  ]);
});

test("dotenv replacement preserves literal hash and multiline assignments", () => {
  const content = mergeEnvironment(
    "export TOKEN='old#value' # keep\nOTHER=`first\nsecond`\n",
    new Map([["TOKEN", "'new#value'"]])
  );
  expect(content).toContain("TOKEN='new#value' # keep");
  expect(content).toContain("OTHER=`first\nsecond`");
  expect(content).not.toContain("old");
});

test("setup can enable development on a staging-only project without deleting other environments", async () => {
  const root = await fixture();
  const project = await findProject(root);
  project.metadata.database!.environments = ["staging"];
  await writeFile(
    join(root, ".dinvolt/config.json"),
    JSON.stringify(project.metadata)
  );
  const runtime = await readFile(join(root, "src/db/environment.ts"), "utf-8");
  await writeFile(
    join(root, "src/db/environment.ts"),
    runtime.replace(
      /(?<declaration>configuredDatabaseEnvironments[^=]*=\s*)\[[\s\S]*?\]/u,
      '$<declaration>["staging"]'
    )
  );
  const staging = await findProject(root);
  await addProjectEnvironments(staging, ["development"]);
  expect((await findProject(root)).metadata.database?.environments).toEqual([
    "development",
    "staging",
  ]);
});

test("connection correction/retry/omission preserve working files and never include credentials in summaries", async () => {
  const root = await fixture();
  const project = await findProject(root);
  const messages: string[] = [];
  const form = ui({ report: (message) => messages.push(message) });
  let attempts = 0;
  let entered = 0;
  form.connection.credential = async (_, field) => {
    entered += 1;
    return field.name === "TURSO_DATABASE_URL"
      ? "turso://corrected.example.com"
      : "private-corrected-token";
  };
  form.connection.failure = async () => (attempts === 1 ? "retry" : "edit");
  const completed = await completeConnection(
    project,
    { environment: "development", credentials: credentials("turso") },
    form,
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("private-corrected-token");
      }
    }
  );
  expect(attempts).toBe(3);
  expect(entered).toBe(2);
  expect(completed?.connection.credentials?.TURSO_AUTH_TOKEN).toBe(
    "private-corrected-token"
  );
  expect(messages.join(",")).not.toContain("private-corrected-token");
  expect(messages.join(",")).not.toContain("corrected.example.com");
});

test("cancelling a missing credential prompt leaves dotenv unchanged", async () => {
  const root = await fixture();
  const before = await readFile(join(root, ".env.local"), "utf-8");
  const form = ui();
  form.connection.credential = async () => {
    throw new Error("Cancelled");
  };
  await expect(
    completeConnection(
      await findProject(root),
      { environment: "development" },
      form
    )
  ).rejects.toThrow("Cancelled");
  expect(await readFile(join(root, ".env.local"), "utf-8")).toBe(before);
});

test("planned environment edits use the existing formatter without writing files or exposing its diagnostics", async () => {
  const { formatProjectEdits } = await import("../src/project-format.ts");
  const root = await fixture();
  const project = await findProject(root);
  project.metadata.ultracite = { linter: "oxlint" };
  const formatter = join(root, "node_modules/oxfmt");
  await mkdir(formatter, { recursive: true });
  await writeFile(
    join(formatter, "package.json"),
    '{"type":"module","bin":"format.mjs"}'
  );
  await writeFile(
    join(formatter, "format.mjs"),
    'import{readFileSync}from"node:fs";process.stdout.write(readFileSync(0,"utf8").toUpperCase());'
  );
  const edits = new Map([
    ["src/db/environment.ts", "planned source"],
    [".env.example", "PRESERVE=example"],
  ]);
  await formatProjectEdits(project, edits);
  expect(edits.get("src/db/environment.ts")).toBe("PLANNED SOURCE");
  expect(edits.get(".env.example")).toBe("PRESERVE=example");
  expect(await readFile(join(root, "src/db/environment.ts"), "utf-8")).not.toBe(
    "PLANNED SOURCE"
  );
  await writeFile(
    join(formatter, "format.mjs"),
    'process.stdout.write("private-formatter-input");process.stderr.write("private-formatter-input");process.exit(1);'
  );
  await expect(formatProjectEdits(project, edits)).rejects.toThrow(
    "Could not format src/db/environment.ts"
  );
});

test("dotenv updates handle CRLF and trailing whitespace without duplicate assignments", () => {
  const actual = mergeEnvironment(
    "TOKEN='old'   # keep\r\nOTHER=value\r\n",
    new Map([["TOKEN", "'new'"]])
  );
  expect(actual).toBe("TOKEN='new' # keep\r\nOTHER=value\r\n");
  expect(actual.match(/TOKEN=/gu)).toHaveLength(1);
});

test("agent status is read-only, has structured connection state and never initializes", async () => {
  const { setupAgent } = await import("../src/setup-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture();
  const before = await readFile(join(root, ".env.local"), "utf-8");
  const output = new CommandOutput(true, true, "setup");
  await setupAgent({ cwd: root, status: true }, output, {
    initialize: async () => {
      throw new Error("Unexpected mutation");
    },
  });
  expect(output.result.status).toBe("needs-attention");
  expect(output.result.details).toEqual({
    connections: [
      { environment: "development", status: "credentials-pending" },
    ],
  });
  expect(await readFile(join(root, ".env.local"), "utf-8")).toBe(before);
  expect(JSON.stringify(output.result)).not.toContain("BETTER_AUTH_SECRET=");
});

test("agent completion stores explicit credentials and calls the shared initializer with exact values", async () => {
  const { setupAgent } = await import("../src/setup-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture();
  const credentialsFile = join(await temp(), "credentials.json");
  await writeFile(credentialsFile, JSON.stringify(credentials("turso")));
  const output = new CommandOutput(true, true, "setup");
  const initialized: string[] = [];
  await setupAgent(
    { cwd: root, complete: "development", credentialsFile },
    output,
    {
      verify: async (_provider, values) => {
        expect(values).toEqual(credentials("turso"));
      },
      initialize: async (_root, connections) => {
        expect(connections).toEqual([
          { environment: "development", credentials: credentials("turso") },
        ]);
        initialized.push("development");
        return [
          { environment: "development", connected: true, status: "ready" },
        ];
      },
    }
  );
  expect(initialized).toEqual(["development"]);
  expect(output.result.status).toBe("completed");
  expect(output.result.completedSteps).toContain("credentials:development");
  expect(
    await effectiveEnvironment(
      root,
      "development",
      Object.keys(credentials("turso"))
    )
  ).toEqual(credentials("turso"));
  expect(JSON.stringify(output.result)).not.toContain("private-token");
});

test("agent validates missing credentials before adding environments", async () => {
  const { setupAgent } = await import("../src/setup-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture();
  const before = await readFile(join(root, ".dinvolt/config.json"), "utf-8");
  await expect(
    setupAgent(
      { cwd: root, addEnvironments: "staging", complete: "staging" },
      new CommandOutput(true, true, "setup")
    )
  ).rejects.toThrow("TURSO_DATABASE_URL_STAGING");
  expect(await readFile(join(root, ".dinvolt/config.json"), "utf-8")).toBe(
    before
  );
});

test("agent refuses credential precedence conflicts and never initializes another database", async () => {
  const { setupAgent } = await import("../src/setup-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture();
  const credentialsFile = join(await temp(), "credentials.json");
  await writeFile(credentialsFile, JSON.stringify(credentials("turso")));
  const previous = process.env.TURSO_DATABASE_URL;
  const { exitCode } = process;
  try {
    process.env.TURSO_DATABASE_URL = "turso://different.example.com";
    const output = new CommandOutput(true, true, "setup");
    await setupAgent(
      { cwd: root, complete: "development", credentialsFile },
      output,
      {
        verify: async () => {},
        initialize: async () => {
          throw new Error("Unexpected database write");
        },
      }
    );
    expect(output.result.status).toBe("needs-attention");
    expect(process.exitCode).toBe(1);
    expect(output.result.database).toEqual([]);
    expect(await readFile(join(root, ".env.local"), "utf-8")).not.toContain(
      "private-token"
    );
  } finally {
    if (previous === undefined) {
      delete process.env.TURSO_DATABASE_URL;
    } else {
      process.env.TURSO_DATABASE_URL = previous;
    }
    process.exitCode = exitCode ?? 0;
  }
});

test("setup recognizes standalone admin metadata and preserves its backend capabilities", async () => {
  const root = await fixture();
  const path = join(root, ".dinvolt/config.json");
  const metadata = JSON.parse(await readFile(path, "utf-8"));
  metadata.projectType = "admin";
  await writeFile(path, JSON.stringify(metadata));
  const project = await findProject(root);
  expect(project.admin).toBe(true);
  expect(project.metadata.projectType).toBe("admin");
  expect(project.metadata.database?.provider).toBe("turso");
});
