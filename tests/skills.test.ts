import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNextProject } from "../src/create.ts";
import { configureProject } from "../src/setup.ts";
import {
  installProjectSkills,
  projectSkills,
  skillTargets,
} from "../src/skills.ts";

const directories: string[] = [];
const common = [
  "vercel-react-best-practices",
  "web-design-guidelines",
  "agent-browser",
  "shadcn",
  "transitions-dev",
  "better-auth-best-practices",
  "better-auth-security-best-practices",
];

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt skills "));
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

test("default creation includes all seven common skills plus Turso", () => {
  expect(projectSkills().flatMap((entry) => entry.skills)).toEqual([
    ...common,
    "turso-db",
  ]);
});

test("disabling skills skips every source and does not invoke the installer or write files", async () => {
  const directory = await fixture();
  for (const database of ["turso", "planetscale-postgres"] as const) {
    expect(projectSkills({ skills: false, database })).toEqual([]);
    await installProjectSkills(
      directory,
      { skills: false, database },
      async () => {
        throw new Error("Must not run");
      }
    );
  }
  expect(await readdir(directory)).toEqual([]);
});

test.each(["turso", "planetscale-postgres"] as const)(
  "installs only selected %s sources sequentially in the project with explicit agent targets",
  async (database) => {
    const directory = await fixture();
    const expected = projectSkills({ database });
    const lock: {
      skills: Record<string, { source: string; computedHash: string }>;
    } = { skills: {} };
    let calls = 0;
    let running = false;
    await installProjectSkills(
      directory,
      { database },
      async (command, args, options) => {
        expect(running).toBe(false);
        running = true;
        const entry = expected[calls]!;
        calls += 1;
        expect(command).toBe(process.execPath);
        expect(args[0]).toEndWith("skills/bin/cli.mjs");
        expect(args.slice(1)).toEqual([
          "add",
          entry.source,
          "--skill",
          ...entry.skills,
          "--agent",
          "universal",
          "claude-code",
          "--copy",
          "--yes",
        ]);
        expect(options).toEqual({ cwd: directory });
        for (const target of skillTargets) {
          expect(await readdir(join(directory, target.directory))).toBeArray();
        }
        for (const name of entry.skills) {
          for (const target of skillTargets) {
            const path = join(directory, target.directory, name);
            await mkdir(path, { recursive: true });
            await writeFile(
              join(path, "SKILL.md"),
              `---\nname: ${name}\ndescription: Test fixture\n---\n`
            );
          }
          lock.skills[name] = {
            source: entry.source,
            computedHash: "test-hash",
          };
        }
        await writeFile(
          join(directory, "skills-lock.json"),
          JSON.stringify(lock)
        );
        running = false;
      }
    );
    expect(calls).toBe(expected.length);
    expect(Object.keys(lock.skills)).toEqual([
      ...common,
      database === "turso" ? "turso-db" : "postgres",
    ]);
  }
);

test.each([
  "missing-file",
  "empty-file",
  "missing-lock",
  "wrong-source",
  "missing-hash",
])(
  "rejects a successful installer with incomplete results: %s",
  async (failure) => {
    const directory = await fixture();
    let calls = 0;
    await expect(
      installProjectSkills(directory, {}, async () => {
        calls += 1;
        const skills: Record<string, object> = {};
        for (const name of common.slice(0, 2)) {
          for (const target of skillTargets) {
            const path = join(directory, target.directory, name);
            await mkdir(path, { recursive: true });
            if (failure !== "missing-file" || target.agent !== "claude-code") {
              await writeFile(
                join(path, "SKILL.md"),
                failure === "empty-file" ? " \n" : "Skill instructions"
              );
            }
          }
          skills[name] = {
            source:
              failure === "wrong-source"
                ? "other/repo"
                : "vercel-labs/agent-skills",
            ...(failure === "missing-hash"
              ? {}
              : { computedHash: "test-hash" }),
          };
        }
        if (failure !== "missing-lock") {
          await writeFile(
            join(directory, "skills-lock.json"),
            JSON.stringify({ skills })
          );
        }
      })
    ).rejects.toThrow(
      "Could not install project skills from vercel-labs/agent-skills"
    );
    expect(calls).toBe(1);
  }
);

test("an installation error preserves its diagnostic and prevents publishing a partial project", async () => {
  const directory = await fixture();
  await expect(
    createNextProject(directory, "skills-failure", "new", async (path) => {
      await mkdir(path);
      await writeFile(join(path, "package.json"), "{}");
      await installProjectSkills(path, {}, async () => {
        throw new Error("Network unavailable");
      });
    })
  ).rejects.toThrow("vercel-labs/agent-skills: Network unavailable");
  expect(await readdir(directory)).toEqual([]);
});

test.each([undefined, true, false])(
  "records the skills preference (%s) and selected sources without changing other project settings",
  async (skills) => {
    const directory = await fixture();
    await writeFile(join(directory, "package.json"), "{}");
    await configureProject(
      directory,
      {
        packageManager: "npm",
        linter: "biome",
        editors: [],
        database: "planetscale-postgres",
        skills,
      },
      "11.0.0",
      async () => {}
    );
    const config = JSON.parse(
      await readFile(join(directory, ".dinvolt/config.json"), "utf-8")
    );
    expect(config.skills).toEqual({
      enabled: skills !== false,
      sources: projectSkills({ database: "planetscale-postgres", skills }),
    });
    expect(config.database.provider).toBe("planetscale-postgres");
    expect(config.editors).toEqual([]);
  }
);
