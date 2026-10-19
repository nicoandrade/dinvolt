import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareAuthStarter } from "../src/auth.ts";
import { prepareDatabaseStarter } from "../src/database.ts";
import type { DatabaseProvider } from "../src/database.ts";
import { findProject } from "../src/project-configuration.ts";
import { vercelJSON, vercelRunner } from "../src/vercel-command.ts";
import type { VercelCommand, VercelRunner } from "../src/vercel-command.ts";
import {
  assertSafeRemoteEnvironment,
  authSecretPlan,
  databaseHostingValues,
} from "../src/vercel-environment.ts";
import type { RemoteVariable } from "../src/vercel-environment.ts";
import {
  inspectGit,
  gitRead,
  inspectRemote,
  parseGitRemote,
  matchesGitLink,
} from "../src/vercel-git.ts";
import { setupVercel } from "../src/vercel-setup.ts";
import type { HostingPrompts } from "../src/vercel-setup.ts";
import { CancelledError } from "../src/wizard-prompts.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const root of directories.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});
async function temporary() {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-vercel-"));
  directories.push(root);
  return root;
}
async function fixture(provider?: DatabaseProvider) {
  const root = await temporary();
  await mkdir(join(root, ".dinvolt"));
  await mkdir(join(root, "src/config"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "hosting-test",
      scripts: { build: "next build" },
      dependencies: { next: "16.4.2" },
    })
  );
  if (provider) {
    await prepareDatabaseStarter(root, provider, [
      "development",
      "staging",
      "production",
    ]);
    await prepareAuthStarter(root, provider, [
      "development",
      "staging",
      "production",
    ]);
    await writeFile(join(root, ".dinvolt/initial-database.json"), "{}");
  }
  await writeFile(
    join(root, "src/config/site.ts"),
    await readFile(new URL("../catalog/ui/site.ts", import.meta.url))
  );
  await writeFile(
    join(root, ".dinvolt/config.json"),
    JSON.stringify({
      schemaVersion: 1,
      projectType: provider ? "public-admin" : "public",
      packageManager: "bun",
      ...(provider
        ? {
            database: {
              provider,
              orm: "drizzle",
              environments: ["development", "staging", "production"],
            },
            auth: { provider: "better-auth", plugins: ["admin"] },
          }
        : {}),
    })
  );
  await writeFile(
    join(root, ".env.local"),
    [
      "BETTER_AUTH_SECRET=local-only-secret-that-must-never-be-copied",
      "DEV_ADMIN_USER=local@example.com",
      "DEV_ADMIN_PASSWORD=local-password",
      "RESEND_API_KEY=local-email",
      "VERCEL_TOKEN=local-token",
      "DINVOLT_DATABASE_ENV=development",
      "TURSO_DATABASE_URL=turso://development.example.com",
      "TURSO_AUTH_TOKEN=dev-token",
      "TURSO_DATABASE_URL_PRODUCTION=turso://production.example.com",
      "TURSO_AUTH_TOKEN_PRODUCTION=production-token",
      "TURSO_DATABASE_URL_STAGING=turso://staging.example.com",
      "TURSO_AUTH_TOKEN_STAGING=staging-token",
      "DATABASE_URL_PRODUCTION=postgresql://app:prod@prod.example.com:6432/app?sslmode=verify-full",
      "DATABASE_URL_DIRECT_PRODUCTION=postgresql://migration:prod@prod.example.com:5432/app?sslmode=verify-full",
      "DATABASE_URL_STAGING=postgresql://app:stage@stage.example.com:6432/app?sslmode=verify-full",
      "DATABASE_URL_DIRECT_STAGING=postgresql://migration:stage@stage.example.com:5432/app?sslmode=verify-full",
    ].join("\n")
  );
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  return root;
}
const git = async () => ({
  names: ["origin"],
  rootDirectory: null,
  dirty: false,
});
const remote = async () =>
  parseGitRemote("origin", "git@github.com:test/repo.git");

function harness(
  options: {
    preview?: boolean;
    create?: boolean;
    login?: boolean;
    wrongTeam?: boolean;
    wrongRepo?: boolean;
    failVariable?: string;
    variables?: RemoteVariable[];
    cancelPlan?: boolean;
    dnsPending?: boolean;
  } = {}
) {
  const calls: VercelCommand[] = [];
  const reports: string[] = [];
  const questions: string[] = [];
  const variables: RemoteVariable[] = structuredClone(options.variables ?? []);
  const project = {
    id: "prj_test",
    name: "assigned-hosting",
    accountId: options.wrongTeam ? "team_other" : "team_test",
    framework: "other",
    nodeVersion: "22.x",
    rootDirectory: null as string | null,
    buildCommand: "custom build" as string | null,
    installCommand: "custom install" as string | null,
    outputDirectory: "custom-output" as string | null,
    autoExposeSystemEnvs: false,
    previewDeploymentsDisabled: false,
    link: options.wrongRepo
      ? { type: "github", org: "other", repo: "repo", productionBranch: "main" }
      : (undefined as
          | {
              type: string;
              org: string;
              repo: string;
              productionBranch: string;
            }
          | undefined),
  };
  let loggedIn = !options.login;
  // eslint-disable-next-line complexity -- Stateful provider double covers ordered commands and API responses.
  const run: VercelRunner = async (command) => {
    calls.push(structuredClone(command));
    const [first, second, key, target] = command.args;
    if (first === "whoami") {
      if (!loggedIn) {
        throw new Error("Login required");
      }
      return "test-user";
    }
    if (first === "login") {
      loggedIn = true;
      return "";
    }
    if (first === "teams") {
      return JSON.stringify({
        teams: [{ id: "team_test", slug: "test-team" }],
      });
    }
    if (first === "project") {
      if (second === "update") {
        const rootIndex = command.args.indexOf("--root-directory");
        Object.assign(project, {
          framework: "nextjs",
          nodeVersion: "24.x",
          rootDirectory: rootIndex === -1 ? null : command.args[rootIndex + 1],
          buildCommand: null,
          installCommand: null,
          outputDirectory: null,
        });
      }
      return "";
    }
    if (first === "git") {
      expect(second).toBe("connect");
      project.link = {
        type: "github",
        org: "test",
        repo: "repo",
        productionBranch: "main",
      };
      return "";
    }
    if (first === "env") {
      if (key === options.failVariable) {
        throw new Error("Permission denied; retry");
      }
      expect(command.input).toBeDefined();
      const existing = variables.find(
        (entry) =>
          entry.key === key &&
          [entry.target].flat().includes(target!) &&
          !entry.gitBranch
      );
      if (second === "add") {
        expect(existing).toBeUndefined();
      } else {
        expect(second).toBe("update");
        expect(existing).toBeDefined();
      }
      const variable = {
        id: existing?.id ?? `env_${variables.length}`,
        key: key!,
        target: [target!],
        type: command.args.at(-1) === "secret" ? "sensitive" : "plain",
        visibility: command.args.at(-1) as "secret" | "config",
        ...(command.args.includes("config") ? { value: command.input } : {}),
      };
      if (existing) {
        Object.assign(existing, variable);
      } else {
        variables.push(variable);
      }
      return "";
    }
    if (first === "api") {
      if (/\/env\/[^/?]+$/u.test(second ?? "")) {
        const existing = variables.find(({ id }) =>
          second?.endsWith(`/env/${id}`)
        );
        expect(existing).toBeDefined();
        const body = JSON.parse(command.input!);
        Object.assign(existing!, body);
        return JSON.stringify(existing);
      }
      if (second?.startsWith("/v9/projects?")) {
        return JSON.stringify({ projects: options.create ? [] : [project] });
      }
      if (second?.includes("/domains?")) {
        return JSON.stringify({
          domains: [{ name: "actual-assigned-42.vercel.app", verified: true }],
        });
      }
      if (second?.startsWith("/v6/domains")) {
        return JSON.stringify({ misconfigured: !!options.dnsPending });
      }
      if (second?.includes("/env?")) {
        return JSON.stringify({ envs: variables });
      }
      if (second?.endsWith("/branch")) {
        if (project.link) {
          project.link.productionBranch = "main";
        }
        return JSON.stringify(project);
      }
      if (command.input && second === "/v9/projects/prj_test") {
        Object.assign(project, JSON.parse(command.input));
      }
      return JSON.stringify(project);
    }
    throw new Error(`Unexpected operation ${first}`);
  };
  const ui: HostingPrompts = {
    choose: async (message, choices) => {
      questions.push(message);
      return message === "Vercel project" && options.create
        ? "create"
        : choices[0]!.value;
    },
    confirm: async (message) => {
      questions.push(message);
      if (message.startsWith("Configure Preview")) {
        return !!options.preview;
      }
      if (
        message.startsWith("Configure password") ||
        message.startsWith("Replace") ||
        message.startsWith("Open dinvolt")
      ) {
        return false;
      }
      if (message.startsWith("Apply")) {
        return !options.cancelPlan;
      }
      return true;
    },
    text: async () => "assigned-hosting",
    secret: async () => {
      throw new Error("Unexpected secret prompt");
    },
    report: (message) => reports.push(message),
  };
  return {
    run,
    ui,
    git,
    remote,
    calls,
    reports,
    questions,
    variables,
    project,
  };
}
function writes(calls: VercelCommand[]) {
  return calls.filter(
    ({ args, input }) =>
      input !== undefined ||
      ["env", "git"].includes(args[0] ?? "") ||
      (args[0] === "project" && args[1] !== "inspect")
  );
}

test("public project creates hosting after login and never asks for DB/auth/email", async () => {
  const root = await fixture();
  const h = harness({ create: true, login: true, preview: true });
  const original = await readFile(join(root, ".env.local"), "utf-8");
  await setupVercel(root, h.ui, h);
  expect(h.calls.some(({ args }) => args[0] === "login")).toBe(true);
  expect(h.variables.map(({ key }) => key)).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  expect(h.variables[0]?.value).toBe("https://actual-assigned-42.vercel.app");
  expect(h.questions.join("\n")).not.toMatch(
    /password recovery|database|secret/iu
  );
  expect(await readFile(join(root, ".env.local"), "utf-8")).toBe(original);
  expect(
    JSON.parse(await readFile(join(root, ".vercel/project.json"), "utf-8"))
      .projectId
  ).toBe("prj_test");
  for (const { args } of h.calls) {
    expect(args).not.toContain("deploy");
    expect(args).not.toContain("redeploy");
    expect(args).not.toContain("pull");
    expect(args).not.toContain("--prod");
    expect(args).not.toContain("disconnect");
  }
});
for (const provider of ["turso", "planetscale-postgres"] as const) {
  test(`${provider}: isolated targets, hidden secrets, variables before Git, rerun preserves remote secrets and overrides`, async () => {
    const root = await fixture(provider);
    const preserved: RemoteVariable[] = [
      {
        id: "foreign",
        key: "CUSTOM_KEY",
        target: ["production"],
        type: "sensitive",
      },
      {
        id: "branch",
        key: "BETTER_AUTH_SECRET",
        target: ["preview"],
        gitBranch: "feature",
        type: "sensitive",
      },
    ];
    const h = harness({ preview: true, variables: preserved });
    await setupVercel(root, h.ui, h);
    const secretWrites = h.calls.filter(
      ({ args }) => args[0] === "env" && args[2] === "BETTER_AUTH_SECRET"
    );
    expect(secretWrites).toHaveLength(2);
    expect(secretWrites[0]!.input).not.toBe(secretWrites[1]!.input);
    const serializedArgs = JSON.stringify(h.calls.map(({ args }) => args));
    expect(serializedArgs).not.toContain("production-token");
    expect(serializedArgs).not.toContain(secretWrites[0]!.input!);
    const uploads = h.calls.filter(({ args }) => args[0] === "env");
    expect(
      uploads.every(
        ({ args, input }) =>
          !/DEV_ADMIN|VERCEL_TOKEN|DINVOLT_DATABASE_ENV/u.test(args[2]!) &&
          !input?.includes("local-") &&
          !input?.includes("dev-token")
      )
    ).toBe(true);
    const db = uploads.filter(({ args }) => /DATABASE|TURSO/u.test(args[2]!));
    expect(db).toHaveLength(4);
    for (const { args } of db) {
      expect(args[2]).toEndWith(
        args[3] === "preview" ? "_STAGING" : "_PRODUCTION"
      );
      expect(args[2]).toStartWith(
        provider === "turso" ? "TURSO_" : "DATABASE_"
      );
    }
    expect(h.calls.findIndex(({ args }) => args[0] === "git")).toBeGreaterThan(
      h.calls.findLastIndex(({ args }) => args[0] === "env")
    );
    const count = h.calls.length;
    const ignoreBefore = await readFile(join(root, ".gitignore"), "utf-8");
    await setupVercel(root, h.ui, h);
    expect(await readFile(join(root, ".gitignore"), "utf-8")).toBe(
      ignoreBefore
    );
    expect(
      h.calls.slice(count).filter(({ args }) => args[0] === "env")
    ).toEqual([]);
    expect(
      h.calls.slice(count).filter(({ args }) => args[0] === "git")
    ).toEqual([]);
    expect(
      h.variables.filter(({ id }) => ["foreign", "branch"].includes(id))
    ).toEqual(preserved);
    expect(h.reports.join("\n")).not.toContain("production-token");
    expect(h.reports.join("\n")).not.toContain(secretWrites[0]!.input!);
  });
}

test("wrong account/repository stops before settings or variable mutations", async () => {
  for (const option of [{ wrongTeam: true }, { wrongRepo: true }]) {
    const root = await fixture();
    const h = harness(option);
    await expect(setupVercel(root, h.ui, h)).rejects.toThrow(/different/u);
    expect(writes(h.calls)).toEqual([]);
  }
});
test("an inaccessible existing link cannot be redirected to the signed-in team", async () => {
  const root = await fixture();
  await mkdir(join(root, ".vercel"));
  await writeFile(
    join(root, ".vercel/project.json"),
    JSON.stringify({ projectId: "prj_test", orgId: "team_other" })
  );
  const h = harness();
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow("not accessible");
  expect(writes(h.calls)).toEqual([]);
});
test("cancel plan preserves files and leaves Git unconnected", async () => {
  const root = await fixture();
  const h = harness({ cancelPlan: true });
  await expect(setupVercel(root, h.ui, h)).rejects.toBeInstanceOf(
    CancelledError
  );
  expect(writes(h.calls)).toEqual([]);
});
test("partial variable failure does not connect Git and resumes without rotating accepted secret", async () => {
  const root = await fixture("turso");
  const h = harness({ failVariable: "BETTER_AUTH_URL" });
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow("Permission");
  expect(h.calls.some(({ args }) => args[0] === "git")).toBe(false);
  const resumed = harness({ variables: h.variables });
  await setupVercel(root, resumed.ui, resumed);
  expect(
    resumed.calls.some(
      ({ args }) => args[0] === "env" && args[2] === "BETTER_AUTH_SECRET"
    )
  ).toBe(false);
  expect(resumed.calls.some(({ args }) => args[0] === "git")).toBe(true);
});
test("incomplete DB offers explicit project setup before any Vercel calls", async () => {
  const root = await fixture("turso");
  await writeFile(
    join(root, ".env.production.local"),
    "TURSO_AUTH_TOKEN_PRODUCTION=\n"
  );
  const h = harness();
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow(
    "TURSO_AUTH_TOKEN_PRODUCTION"
  );
  expect(
    h.questions.some((message) => message.startsWith("Open dinvolt setup"))
  ).toBe(true);
  expect(h.calls).toEqual([]);
});
test("effective Next production precedence is used without copying development overrides", async () => {
  const root = await fixture("turso");
  await writeFile(
    join(root, ".env.production.local"),
    "TURSO_AUTH_TOKEN_PRODUCTION=priority-token\n"
  );
  const values = await databaseHostingValues(
    await findProject(root),
    "production"
  );
  expect(
    values.find(({ key }) => key === "TURSO_AUTH_TOKEN_PRODUCTION")?.value
  ).toBe("priority-token");
});
test("DNS pending is resumable and never connects or writes variables", async () => {
  const root = await fixture();
  const h = harness({ dnsPending: true });
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow("DNS is pending");
  expect(writes(h.calls)).toEqual([]);
});
test("unsafe remote variables, including branch overrides, require explicit remediation", async () => {
  const project = await findProject(await fixture("turso"));
  for (const key of [
    "DINVOLT_DATABASE_ENV",
    "DEV_ADMIN_PASSWORD",
    "VERCEL_TOKEN",
    "VERCEL_ENV",
    "NEXT_PUBLIC_VERCEL_URL",
    "DATABASE_URL_PRODUCTION",
    "TURSO_AUTH_TOKEN",
    "TURSO_AUTH_TOKEN_STAGING",
  ]) {
    expect(() =>
      assertSafeRemoteEnvironment(
        project,
        [{ id: "x", key, target: ["production"], gitBranch: "branch" }],
        ["production"]
      )
    ).toThrow();
  }
  expect(
    authSecretPlan(
      [
        {
          id: "secret",
          key: "BETTER_AUTH_SECRET",
          target: ["production"],
          type: "sensitive",
        },
      ],
      "production"
    )
  ).toEqual([]);
  expect(() =>
    authSecretPlan(
      [
        {
          id: "secret",
          key: "BETTER_AUTH_SECRET",
          target: ["production", "preview"],
        },
      ],
      "preview"
    )
  ).toThrow("shared");
});
test("custom migration build hooks are rejected before hosting access", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: { build: "next build", prebuild: "drizzle-kit migrate" },
    })
  );
  const h = harness();
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow("build lifecycle");
  expect(h.calls).toEqual([]);
});
test("multiple remotes are selected explicitly", async () => {
  const root = await fixture();
  const h = harness();
  let selected = "";
  h.ui.choose = async (message, choices) =>
    message.startsWith("Git remote") ? "upstream" : choices[0]!.value;
  await setupVercel(root, h.ui, {
    ...h,
    git: async () => ({
      names: ["origin", "upstream"],
      rootDirectory: "apps/site",
      dirty: true,
    }),
    remote: async (_, name) => {
      selected = name;
      return h.remote();
    },
  });
  expect(selected).toBe("upstream");
  expect(h.calls.some(({ args }) => args.includes("apps/site"))).toBe(true);
});
test("Git probes reject missing main and absent remotes without fetching or modifying refs", async () => {
  const root = await fixture();
  await expect(inspectGit(root)).rejects.toThrow("Publish");
  const bare = await temporary();
  execFileSync("git", ["init", "--bare", "--quiet", bare]);
  execFileSync(
    "git",
    ["remote", "add", "origin", "https://github.com/test/repo.git"],
    { cwd: root }
  );
  // Substitute only the transport, after validating the real cloud URL. Git's
  // actual ls-remote must reject a missing main and accept it once published.
  const read = (cwd: string, args: string[]) =>
    gitRead(
      cwd,
      args[0] === "ls-remote"
        ? ["ls-remote", "--exit-code", bare, "refs/heads/main"]
        : args
    );
  await expect(inspectRemote(root, "origin", read)).rejects.toThrow(
    "published main"
  );
  execFileSync("git", ["add", "package.json"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--quiet",
      "-m",
      "Fixture",
    ],
    { cwd: root }
  );
  execFileSync("git", ["push", "--quiet", bare, "main"], { cwd: root });
  const before = await gitRead(root, ["show-ref"]);
  expect((await inspectRemote(root, "origin", read)).repository).toBe(
    "test/repo"
  );
  expect(await gitRead(root, ["show-ref"])).toBe(before);
  expect(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf-8",
    })
  ).toContain(".dinvolt/");
});
test("remote parser accepts official cloud providers and hides credentials in rejection", () => {
  expect(
    parseGitRemote("origin", "git@github.com:org/repo.git").repository
  ).toBe("org/repo");
  expect(
    parseGitRemote("origin", "https://gitlab.com/org/group/repo.git").provider
  ).toBe("gitlab");
  expect(
    parseGitRemote("origin", "ssh://git@bitbucket.org/org/repo.git").provider
  ).toBe("bitbucket");
  for (const url of [
    "https://secret@github.com/org/repo",
    "https://github.internal/org/repo",
    "https://github.com/org/repo?token=secret",
    "file:///tmp/repo",
  ]) {
    try {
      parseGitRemote("origin", url);
      throw new Error("Expected rejection");
    } catch (error) {
      expect((error as Error).message).not.toContain("secret@");
    }
  }
});
test("provider stdout/stderr and malformed JSON never expose submitted secrets", async () => {
  const root = await temporary();
  const npm = join(root, "npm");
  await writeFile(
    npm,
    '#!/usr/bin/env node\nprocess.stdin.on("data", d => { process.stdout.write(d); process.stderr.write(d); }); process.stdin.on("end", () => process.exit(1));'
  );
  await chmod(npm, 0o755);
  const original = process.env.PATH;
  process.env.PATH = `${root}:${original}`;
  try {
    await expect(
      vercelRunner(root)({
        args: ["env", "add", "PRIVATE_KEY", "production"],
        input: "never-display-secret",
      })
    ).rejects.toThrow("Provider output was withheld");
    await expect(
      vercelJSON(async () => "never-display-secret", { args: [] })
    ).rejects.toThrow("unreadable response");
  } finally {
    process.env.PATH = original;
  }
});

test("GitLab nested groups and Bitbucket link responses use official provider fields", () => {
  expect(
    matchesGitLink(
      { type: "gitlab", projectUrl: "https://gitlab.com/group/subgroup/repo" },
      parseGitRemote("origin", "git@gitlab.com:group/subgroup/repo.git")
    )
  ).toBe(true);
  expect(
    matchesGitLink(
      { type: "bitbucket", owner: "workspace", slug: "repo" },
      parseGitRemote("origin", "git@bitbucket.org:workspace/repo.git")
    )
  ).toBe(true);
  expect(
    matchesGitLink(
      { type: "github-limited", org: "Org", repo: "Repo" },
      parseGitRemote("origin", "git@github.com:org/repo.git")
    )
  ).toBe(true);
  expect(
    matchesGitLink(
      { type: "gitlab", projectUrl: "https://gitlab.com/another/repo" },
      parseGitRemote("origin", "git@gitlab.com:group/repo.git")
    )
  ).toBe(false);
});

test("replacing a base Preview key uses its ID and preserves branch overrides", async () => {
  const root = await fixture("turso");
  const branch = {
    id: "env_branch",
    key: "TURSO_AUTH_TOKEN_STAGING",
    target: ["preview"],
    gitBranch: "feature",
    type: "sensitive",
    value: "branch-token",
  };
  const h = harness({
    preview: true,
    variables: [
      {
        id: "env_base",
        key: "TURSO_AUTH_TOKEN_STAGING",
        target: ["preview"],
        type: "sensitive",
      },
      branch,
    ],
  });
  const { confirm } = h.ui;
  h.ui.confirm = async (message) =>
    message.startsWith("Replace") || confirm(message);
  await setupVercel(root, h.ui, h);
  const patch = h.calls.find(
    ({ args }) => args[0] === "api" && args[1]?.endsWith("/env/env_base")
  );
  expect(JSON.parse(patch!.input!)).toEqual({
    value: "staging-token",
    type: "sensitive",
    visibility: "secret",
  });
  expect(patch!.args[1]).toBe("/v10/projects/prj_test/env/env_base");
  expect(h.variables.find(({ id }) => id === "env_branch")).toEqual(branch);
  expect(
    h.calls.some(({ args }) => args[0] === "env" && args[1] === "update")
  ).toBe(false);
});

test("malformed local links are preserved and rejected before provider access", async () => {
  for (const source of [
    "",
    "{}",
    "null",
    '{"projectId":42,"orgId":"team_test"}',
    '{"projectId":"prj_test"}',
  ]) {
    const root = await fixture();
    await mkdir(join(root, ".vercel"));
    await writeFile(join(root, ".vercel/project.json"), source);
    const h = harness();
    await expect(setupVercel(root, h.ui, h)).rejects.toThrow(
      "Invalid .vercel/project.json"
    );
    expect(h.calls).toEqual([]);
    expect(await readFile(join(root, ".vercel/project.json"), "utf-8")).toBe(
      source
    );
  }
});

test("repository mappings are never shadowed with a new project link", async () => {
  const root = await fixture();
  await mkdir(join(root, ".vercel"));
  const source = JSON.stringify({
    remoteName: "origin",
    projects: [{ id: "other", directory: ".", orgId: "other_team" }],
  });
  await writeFile(join(root, ".vercel/repo.json"), source);
  const h = harness();
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow("repo.json");
  expect(h.calls).toEqual([]);
  expect(await readFile(join(root, ".vercel/repo.json"), "utf-8")).toBe(source);
  await expect(readFile(join(root, ".vercel/project.json"))).rejects.toThrow();
});

test("cancelled authentication exits without prompting for another login", async () => {
  const root = await fixture();
  const h = harness();
  await expect(
    setupVercel(root, h.ui, {
      ...h,
      run: async () => {
        throw new CancelledError();
      },
    })
  ).rejects.toBeInstanceOf(CancelledError);
  expect(h.questions.some((message) => message.includes("Log in"))).toBe(false);
});

test("an account without teams stops without rendering an empty selector", async () => {
  const root = await fixture();
  const h = harness();
  await expect(
    setupVercel(root, h.ui, {
      ...h,
      run: async (command) =>
        command.args[0] === "teams"
          ? JSON.stringify({ teams: [] })
          : h.run(command),
    })
  ).rejects.toThrow("No accessible Vercel teams");
  expect(h.questions).not.toContain("Vercel team");
  expect(writes(h.calls)).toEqual([]);
});

test("Vercel build scripts and alternative configuration files cannot bypass preflight", async () => {
  for (const script of [
    "vercel-build",
    "prevercel-build",
    "postvercel-build",
    "prepublish",
    "preprepare",
    "postprepare",
  ]) {
    const root = await fixture();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        scripts: { build: "next build", [script]: "drizzle-kit migrate" },
      })
    );
    const h = harness();
    await expect(setupVercel(root, h.ui, h)).rejects.toThrow("build lifecycle");
    expect(h.calls).toEqual([]);
  }
  for (const [file, source] of [
    ["vercel.ts", "export default { buildCommand: 'drizzle-kit migrate' }"],
    ["vercel.toml", 'buildCommand = "drizzle-kit migrate"'],
    ["now.json", '{"builds":[]}'],
    ["vercel.json", '{"builds":[]}'],
    ["vercel.json", '{"ignoreCommand":"drizzle-kit migrate"}'],
    ["vercel.json", "[]"],
  ]) {
    const root = await fixture();
    await writeFile(join(root, file!), source!);
    const h = harness();
    await expect(setupVercel(root, h.ui, h)).rejects.toThrow();
    expect(h.calls).toEqual([]);
    expect(await readFile(join(root, file!), "utf-8")).toBe(source!);
  }
});

test("concurrent variable destination changes invalidate the approved plan", async () => {
  const root = await fixture("turso");
  const h = harness({
    variables: [
      {
        id: "db",
        key: "TURSO_AUTH_TOKEN_PRODUCTION",
        target: ["production"],
        type: "sensitive",
      },
    ],
  });
  const { confirm } = h.ui;
  h.ui.confirm = async (message) => {
    if (message.startsWith("Apply")) {
      h.variables[0]!.target = ["production", "preview"];
    }
    return message.startsWith("Replace") || confirm(message);
  };
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow(
    "variables changed during setup"
  );
  expect(writes(h.calls)).toEqual([]);
});

test("a retained auth secret disappearing during writes prevents Git connection", async () => {
  const root = await fixture("turso");
  const h = harness({
    variables: [
      {
        id: "retained",
        key: "BETTER_AUTH_SECRET",
        target: ["production"],
        type: "sensitive",
      },
    ],
  });
  let inventories = 0;
  await expect(
    setupVercel(root, h.ui, {
      ...h,
      run: async (command) => {
        if (command.args[1]?.includes("/env?")) {
          inventories += 1;
        }
        if (command.args[1]?.includes("/env?") && inventories === 3) {
          h.variables.splice(
            h.variables.findIndex(({ id }) => id === "retained"),
            1
          );
        }
        return h.run(command);
      },
    })
  ).rejects.toThrow("all required variables");
  expect(h.calls.some(({ args }) => args[0] === "git")).toBe(false);
});

test("unapplied project settings prevent Git connection despite successful commands", async () => {
  const root = await fixture();
  const h = harness();
  await expect(
    setupVercel(root, h.ui, {
      ...h,
      run: async (command) =>
        command.args[0] === "project" && command.args[1] === "update"
          ? ""
          : h.run(command),
    })
  ).rejects.toThrow("planned build and environment settings");
  expect(h.calls.some(({ args }) => args[0] === "git")).toBe(false);
});

test("incomplete environment inventory stops without writing or connecting Git", async () => {
  const root = await fixture();
  const h = harness();
  await expect(
    setupVercel(root, h.ui, {
      ...h,
      run: async (command) =>
        command.args[1]?.includes("/env?")
          ? JSON.stringify({ envs: [], pagination: { next: 123 } })
          : h.run(command),
    })
  ).rejects.toThrow("incomplete inventory");
  expect(writes(h.calls)).toEqual([]);
});

test("reruns compare encrypted Config origins by ID without requesting private secrets", async () => {
  const root = await fixture("turso");
  const h = harness();
  await setupVercel(root, h.ui, h);
  const configs = h.variables.filter(
    ({ visibility }) => visibility === "config"
  );
  const clearValues = new Map(configs.map(({ id, value }) => [id, value]));
  for (const variable of configs) {
    variable.type = "encrypted";
    variable.value = "opaque-ciphertext";
  }
  const count = h.calls.length;
  const reads: string[] = [];
  await setupVercel(root, h.ui, {
    ...h,
    run: async (command) => {
      if (command.args[1]?.startsWith("/v1/projects/")) {
        const variable = configs.find(({ id }) =>
          command.args[1]?.endsWith(`/env/${id}`)
        );
        expect(variable).toBeDefined();
        reads.push(variable!.key);
        return JSON.stringify({
          ...variable,
          value: clearValues.get(variable!.id),
          decrypted: true,
        });
      }
      return h.run(command);
    },
  });
  expect(new Set(reads)).toEqual(
    new Set(["BETTER_AUTH_URL", "NEXT_PUBLIC_SITE_URL"])
  );
  expect(
    h.calls
      .slice(count)
      .some(({ args }) => args[0] === "env" || args[1]?.includes("/env/"))
  ).toBe(false);
});

test("an incorrect saved origin or readable secret prevents a new Git connection", async () => {
  for (const key of ["NEXT_PUBLIC_SITE_URL", "TURSO_AUTH_TOKEN_PRODUCTION"]) {
    const root = await fixture("turso");
    const h = harness();
    let inventories = 0;
    await expect(
      setupVercel(root, h.ui, {
        ...h,
        run: async (command) => {
          if (command.args[1]?.includes("/env?")) {
            inventories += 1;
            if (inventories === 3) {
              Object.assign(
                h.variables.find((variable) => variable.key === key)!,
                {
                  type: "plain",
                  visibility: "config",
                  value: "https://wrong.example.com",
                }
              );
            }
          }
          return h.run(command);
        },
      })
    ).rejects.toThrow("Vercel did not confirm");
    expect(h.calls.some(({ args }) => args[0] === "git")).toBe(false);
  }
});

test("Preview preflight requires the auth origin helper before provider access", async () => {
  const root = await fixture("turso");
  await rm(join(root, "src/lib/auth-origin.ts"));
  const h = harness({ preview: true });
  await expect(setupVercel(root, h.ui, h)).rejects.toThrow("auth-origin.ts");
  expect(h.calls).toEqual([]);
});

test("team discovery uses paginated native CLI output before any scoped API", async () => {
  const root = await fixture();
  const h = harness();
  const pages: string[][] = [];
  await setupVercel(root, h.ui, {
    ...h,
    run: async (command) => {
      if (command.args[0] === "teams") {
        pages.push(command.args);
        if (!command.args.includes("--next")) {
          return JSON.stringify({ teams: [], pagination: { next: 123 } });
        }
      }
      if (command.args[0] === "api") {
        expect(command.args).toContain("--scope");
      }
      return h.run(command);
    },
  });
  expect(pages).toHaveLength(2);
  expect(pages[1]?.slice(-2)).toEqual(["--next", "123"]);
});

test("agent hosting uses explicit targets and returns a secret-free outcome without interactive subprocesses", async () => {
  const { vercelAgent } = await import("../src/vercel-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture("turso");
  const state = harness({ preview: true });
  const output = new CommandOutput(true, true, "vercel setup");
  await vercelAgent(
    {
      cwd: root,
      apply: true,
      team: "test-team",
      project: "assigned-hosting",
      origin: "https://actual-assigned-42.vercel.app",
      preview: true,
    },
    output,
    { run: state.run, git, remote }
  );
  expect(output.result.details?.hosting).toMatchObject({
    team: "team_test",
    project: "prj_test",
    targets: ["production", "preview"],
  });
  expect(output.result.completedSteps).toContain("git-connected");
  expect(output.result.completedSteps).toContain("production-branch");
  expect(state.calls.some((call) => call.interactive)).toBe(false);
  expect(
    state.calls.some((call) => ["deploy", "login"].includes(call.args[0]!))
  ).toBe(false);
  expect(JSON.stringify(output.result)).not.toMatch(
    /production-token|staging-token|local-only-secret/u
  );
});

test("agent hosting refuses missing authorization, login and mismatched targets", async () => {
  const { vercelAgent } = await import("../src/vercel-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture();
  const options = {
    cwd: root,
    apply: true,
    team: "test-team",
    project: "assigned-hosting",
    origin: "https://actual-assigned-42.vercel.app",
  };
  const state = harness({ login: true });
  await expect(
    vercelAgent(
      { ...options, apply: false },
      new CommandOutput(true, true, "vercel setup"),
      { run: state.run, git, remote }
    )
  ).rejects.toThrow("--apply");
  expect(state.calls).toEqual([]);
  await expect(
    vercelAgent(options, new CommandOutput(true, true, "vercel setup"), {
      run: state.run,
      git,
      remote,
    })
  ).rejects.toThrow("Authenticate separately");
  expect(state.calls.some((call) => call.args[0] === "login")).toBe(false);
  const accessible = harness();
  await mkdir(join(root, ".vercel"));
  await writeFile(
    join(root, ".vercel/project.json"),
    JSON.stringify({ projectId: "prj_test", orgId: "team_test" })
  );
  await expect(
    vercelAgent(
      { ...options, project: "another-project" },
      new CommandOutput(true, true, "vercel setup"),
      { run: accessible.run, git, remote }
    )
  ).rejects.toThrow("conflicts with the local link");
  expect(
    accessible.calls.some((call) =>
      ["update", "create", "connect"].includes(call.args[1]!)
    )
  ).toBe(false);
});

test("agent preserves completed hosting steps after a variable failure", async () => {
  const { vercelAgent } = await import("../src/vercel-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture();
  const state = harness({ failVariable: "NEXT_PUBLIC_SITE_URL" });
  const output = new CommandOutput(true, true, "vercel setup");
  await expect(
    vercelAgent(
      {
        cwd: root,
        apply: true,
        team: "team_test",
        project: "prj_test",
        origin: "https://actual-assigned-42.vercel.app",
      },
      output,
      { run: state.run, git, remote }
    )
  ).rejects.toThrow();
  expect(output.result.completedSteps).toContain("project-settings");
  expect(output.result.completedSteps).not.toContain("git-connected");
  expect(state.calls.some((call) => call.args[0] === "git")).toBe(false);
});

test("agent can create a project, associate an explicit domain and configure remote email", async () => {
  const { vercelAgent } = await import("../src/vercel-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture("turso");
  const state = harness({ create: true });
  const emailFile = join(await temporary(), "email.json");
  await writeFile(
    emailFile,
    JSON.stringify({
      production: {
        RESEND_API_KEY: "remote-email-secret",
        EMAIL_FROM: "QA <qa@example.com>",
      },
    })
  );
  let domainAdded = false;
  const output = new CommandOutput(true, true, "vercel setup");
  await vercelAgent(
    {
      cwd: root,
      apply: true,
      team: "team_test",
      newProject: "assigned-hosting",
      origin: "https://custom.example.com",
      addDomain: true,
      emailFile,
    },
    output,
    {
      git,
      remote,
      run: async (command) => {
        if (command.args[0] === "domains") {
          domainAdded = true;
          return "";
        }
        if (
          domainAdded &&
          command.args[0] === "api" &&
          command.args[1]?.includes("/domains?")
        ) {
          return JSON.stringify({
            domains: [{ name: "custom.example.com", verified: true }],
          });
        }
        return state.run(command);
      },
    }
  );
  expect(output.result.completedSteps).toContain("project-created");
  expect(output.result.completedSteps).toContain("domain-associated");
  expect(output.result.details?.hosting).toMatchObject({
    origin: "https://custom.example.com",
    emailPending: [],
  });
  expect(
    state.calls.some(
      (command) =>
        command.args[0] === "env" &&
        command.args[2] === "RESEND_API_KEY" &&
        command.input === "remote-email-secret"
    )
  ).toBe(true);
  expect(JSON.stringify(output.result)).not.toContain("remote-email-secret");
});

test("agent replaces only explicitly selected target keys and preserves existing secrets", async () => {
  const { vercelAgent } = await import("../src/vercel-agent.ts");
  const { CommandOutput } = await import("../src/command-output.ts");
  const root = await fixture("turso");
  const state = harness({
    variables: [
      {
        id: "env_origin",
        key: "NEXT_PUBLIC_SITE_URL",
        target: ["production"],
        type: "plain",
        value: "https://old.example.com",
      },
      {
        id: "env_token",
        key: "TURSO_AUTH_TOKEN_PRODUCTION",
        target: ["production"],
        type: "sensitive",
      },
    ],
  });
  const output = new CommandOutput(true, true, "vercel setup");
  await vercelAgent(
    {
      cwd: root,
      apply: true,
      team: "team_test",
      project: "prj_test",
      origin: "https://actual-assigned-42.vercel.app",
      replace: "production:NEXT_PUBLIC_SITE_URL",
    },
    output,
    { run: state.run, git, remote }
  );
  expect(
    state.calls.some(
      (call) => call.args[1]?.endsWith("/env/env_origin") && call.input
    )
  ).toBe(true);
  expect(
    state.calls.some(
      (call) => call.args[1]?.endsWith("/env/env_token") && call.input
    )
  ).toBe(false);
  expect(output.result.completedSteps).toContain("production-branch");
});
