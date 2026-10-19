import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const directories: string[] = [];

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt test "));
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

describe("Compiled CLI running on Node.js", () => {
  test("ui add documents its project default and help does not create files", async () => {
    const directory = await fixture();
    const result = spawnSync("node", [cli, "ui", "add", "--help"], {
      cwd: directory,
      encoding: "utf-8",
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("project default");
    expect(result.stdout).toContain("admin for older projects");
    expect(result.stdout).toContain("public");
    expect(await readdir(directory)).toEqual([]);
  });

  test("ui add rejects invalid targets and missing components before writing files", async () => {
    const directory = await fixture();
    for (const args of [
      ["ui", "add", "button", "--target", "other"],
      ["ui", "add"],
    ]) {
      const result = spawnSync("node", [cli, ...args], {
        cwd: directory,
        encoding: "utf-8",
        timeout: 10_000,
      });
      expect(result.status).toBe(1);
      expect(await readdir(directory)).toEqual([]);
    }
  });

  test("create appears in help and its help does not prepare a project", async () => {
    const directory = await fixture();
    for (const args of [["--help"], ["create", "--help"]]) {
      const result = spawnSync("node", [cli, ...args], {
        cwd: directory,
        encoding: "utf-8",
        timeout: 10_000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("create");
      expect(result.stdout).not.toMatch(/^\s+(?:init|catalog)\b/mu);
    }
    expect(await readdir(directory)).toEqual([]);
  });

  test("setup is discoverable and rejects missing project metadata without changing files", async () => {
    const directory = await fixture();
    const help = spawnSync("node", [cli, "setup", "--help"], {
      cwd: directory,
      encoding: "utf-8",
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--cwd");
    expect(help.stdout).toContain("existing");
    const attempt = spawnSync("node", [cli, "setup", "--cwd", directory], {
      encoding: "utf-8",
    });
    expect(attempt.status).toBe(1);
    expect(attempt.stderr).toContain("No Dinvolt metadata");
    expect(await readdir(directory)).toEqual([]);
  });

  test("create without a terminal reports missing input and leaves files untouched", async () => {
    const directory = await fixture();
    const result = spawnSync("node", [cli, "create", "--cwd", directory], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--name");
    expect(await readdir(directory)).toEqual([]);
  });
});

test("vercel setup help and noninteractive failure never deploy or create files", async () => {
  const directory = await fixture();
  const help = spawnSync("node", [cli, "vercel", "setup", "--help"], {
    cwd: directory,
    encoding: "utf-8",
  });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain("--cwd");
  expect(help.stdout).toContain("Git pushes");
  const result = spawnSync(
    "node",
    [cli, "vercel", "setup", "--cwd", directory],
    { cwd: directory, encoding: "utf-8" }
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("--apply");
  expect(await readdir(directory)).toEqual([]);
  const forbidden = spawnSync("node", [cli, "deploy"], {
    cwd: directory,
    encoding: "utf-8",
  });
  expect(forbidden.status).toBe(1);
  expect(forbidden.stderr).toContain("unknown command");
});

test.each(
  [
    [],
    ["--name", "test"],
    ["--name", "test", "--project-type", "invalid"],
    ["--name", "test", "--project-type", "public", "--database", "turso"],
    ["--name", "../outside", "--project-type", "public"],
    ["--name", "test", "--project-type", "public", "--editors", "invalid"],
    ["--unknown"],
    ["--name"],
  ].map((args) => ({ args }))
)(
  "create JSON errors are one parseable result without mutations: %j",
  async ({ args }) => {
    const directory = await fixture();
    const result = spawnSync(
      "node",
      [cli, "create", "--json", "--cwd", directory, ...args],
      { encoding: "utf-8", timeout: 10_000 }
    );
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "create",
      status: "failed",
      project: null,
      error: { code: "INVALID_OPTIONS" },
    });
    expect(result.stderr).toBe("");
    expect(await readdir(directory)).toEqual([]);
  }
);

test("JSON help remains discoverable text and does not create files", async () => {
  const directory = await fixture();
  const result = spawnSync("node", [cli, "create", "--json", "--help"], {
    cwd: directory,
    encoding: "utf-8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("--no-input");
  expect(result.stdout).toContain("--credentials-file");
  expect(await readdir(directory)).toEqual([]);
});

test("JSON destination conflict preserves existing files", async () => {
  const directory = await fixture();
  const { writeFile, readFile } = await import("node:fs/promises");
  await writeFile(join(directory, "keep.txt"), "existing");
  const result = spawnSync(
    "node",
    [
      cli,
      "create",
      "--json",
      "--cwd",
      directory,
      "--name",
      "test",
      "--project-type",
      "public",
      "--no-skills",
    ],
    { encoding: "utf-8" }
  );
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: "failed",
    project: null,
  });
  expect(await readFile(join(directory, "keep.txt"), "utf-8")).toBe("existing");
});

test.each([
  { args: ["setup", "--unknown"], command: "setup" },
  { args: ["setup", "--complete"], command: "setup" },
  { args: ["vercel", "setup"], command: "vercel setup" },
  { args: ["vercel", "setup", "--apply"], command: "vercel setup" },
  { args: ["vercel", "setup", "--unknown"], command: "vercel setup" },
  { args: ["ui", "add"], command: "ui add" },
  { args: ["ui", "add", "button", "--target", "unknown"], command: "ui add" },
])(
  "agent parser errors retain the command identity: %j",
  async ({ args, command }) => {
    const directory = await fixture();
    const result = spawnSync(
      "node",
      [cli, ...args, "--json", "--cwd", directory],
      { encoding: "utf-8", timeout: 10_000 }
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      command,
      status: "failed",
      error: { code: "INVALID_OPTIONS" },
    });
    expect(result.stderr).toBe("");
    expect(await readdir(directory)).toEqual([]);
  }
);

test("compiled setup JSON on a public project is a successful no-op", async () => {
  const directory = await fixture();
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(join(directory, ".dinvolt"));
  await writeFile(
    join(directory, ".dinvolt/config.json"),
    JSON.stringify({
      schemaVersion: 1,
      projectType: "public",
      packageManager: "bun",
    })
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "public-test" })
  );
  const result = spawnSync(
    "node",
    [cli, "setup", "--json", "--cwd", directory],
    { encoding: "utf-8" }
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    command: "setup",
    status: "completed",
    details: { projectType: "public", connections: [] },
  });
  expect((await readdir(directory)).toSorted()).toEqual([
    ".dinvolt",
    "package.json",
  ]);
});
