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
import { fileURLToPath } from "node:url";

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
  "keep-a-changelog",
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

test("default creation includes common skills, bundled changelog skill and Turso", () => {
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
        const installSource = entry.bundled
          ? fileURLToPath(new URL("../skills", import.meta.url))
          : entry.source;
        calls += 1;
        expect(command).toBe(process.execPath);
        expect(args[0]).toEndWith("skills/bin/cli.mjs");
        expect(args.slice(1)).toEqual([
          "add",
          installSource,
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
            source: installSource,
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

test("bundled skill installs through the real CLI with a portable lock and preserves external entries", async () => {
  const directory = await fixture();
  await installProjectSkills(
    directory,
    {},
    async (command, args, options = {}) => {
      if (args[2] === fileURLToPath(new URL("../skills", import.meta.url))) {
        const child = Bun.spawn([command, ...args], {
          cwd: options.cwd,
          env: { ...process.env, DISABLE_TELEMETRY: "1" },
          stdout: "pipe",
          stderr: "pipe",
        });
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        if (code !== 0) {
          throw new Error(`${stdout}\n${stderr}`);
        }
        return;
      }
      const lockPath = join(directory, "skills-lock.json");
      const lock = await readFile(lockPath, "utf-8")
        .then((content) => JSON.parse(content))
        .catch(() => ({ version: 1, skills: {} }));
      const source = args[2]!;
      const names = args.slice(4, args.indexOf("--agent"));
      for (const name of names) {
        for (const target of skillTargets) {
          const path = join(directory, target.directory, name);
          await mkdir(path, { recursive: true });
          await writeFile(join(path, "SKILL.md"), "External fixture");
        }
        lock.skills[name] = { source, computedHash: "external-hash" };
      }
      await writeFile(lockPath, JSON.stringify(lock));
    }
  );
  for (const target of skillTargets) {
    expect(
      await readFile(
        join(directory, target.directory, "keep-a-changelog/SKILL.md"),
        "utf-8"
      )
    ).toBe(
      await readFile(
        new URL("../skills/keep-a-changelog/SKILL.md", import.meta.url),
        "utf-8"
      )
    );
    expect(
      await readFile(
        join(
          directory,
          target.directory,
          "keep-a-changelog/agents/openai.yaml"
        ),
        "utf-8"
      )
    ).toContain('display_name: "Keep a Changelog"');
  }
  const lock = JSON.parse(
    await readFile(join(directory, "skills-lock.json"), "utf-8")
  );
  expect(lock.skills["keep-a-changelog"]).toEqual({
    source: "nicoandrade/dinvolt",
    sourceType: "github",
    skillPath: "skills/keep-a-changelog/SKILL.md",
    computedHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
  expect(lock.skills["vercel-react-best-practices"].computedHash).toBe(
    "external-hash"
  );
  expect(lock.skills["turso-db"].computedHash).toBe("external-hash");
}, 15_000);

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
