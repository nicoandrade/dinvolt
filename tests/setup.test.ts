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
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveConfigPaths } from "@shadcn/registry/internal/get-config";
import { updateFiles } from "@shadcn/registry/internal/updaters/update-files";

import { prepareAuthStarter } from "../src/auth.ts";
import { prepareDatabaseStarter } from "../src/database.ts";
import {
  checkStarter,
  configureProject,
  detectProjectPackageManager,
  developmentCommand,
  packageManagers,
  prepareStarter,
  ultraciteArguments,
} from "../src/setup.ts";
import type { PackageManager } from "../src/setup.ts";
import { prepareTRPCStarter } from "../src/trpc.ts";
import {
  addUIComponents,
  configureUIStandards,
  defaultAdminBlocks,
  prepareUIStarter,
} from "../src/ui.ts";

const directories: string[] = [];
const require = createRequire(import.meta.url);
const ultracite = fileURLToPath(
  new URL(
    "../../dist/index.js",
    pathToFileURL(require.resolve("ultracite/oxfmt"))
  )
);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-setup-"));
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

test.each([...packageManagers])(
  "detects %s from the project's declared package manager",
  async (name) => {
    const directory = await fixture();
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ packageManager: `${name}@1.2.3` })
    );
    await writeFile(join(directory, "bun.lock"), "Conflicting lockfile");
    expect(await detectProjectPackageManager(directory)).toBe(name);
  }
);

const lockfiles: [string, PackageManager][] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["deno.lock", "deno"],
  ["nub.lock", "nub"],
  ["aube-lock.yaml", "aube"],
];
test.each(lockfiles)(
  "detects the package manager from %s",
  async (lockfile, name) => {
    const directory = await fixture();
    await writeFile(join(directory, lockfile!), "");
    expect(await detectProjectPackageManager(directory)).toBe(name);
  }
);

test("new projects do not inherit the parent directory's package manager", async () => {
  const parent = await fixture();
  await writeFile(
    join(parent, "package.json"),
    JSON.stringify({ packageManager: "pnpm@10.0.0" })
  );
  const child = join(parent, "new-app");
  expect(await detectProjectPackageManager(child)).toBeUndefined();
  await mkdir(child);
  expect(await detectProjectPackageManager(child)).toBeUndefined();
});

test("passes the shadcn plugin only to Oxlint and always enables React and Next.js", () => {
  for (const linter of ["oxlint", "biome", "eslint"] as const) {
    const args = ultraciteArguments({
      packageManager: "npm",
      linter,
      editors: ["universal", "zed"],
    });
    expect(
      args.slice(
        args.indexOf("--frameworks") + 1,
        args.indexOf("--frameworks") + 3
      )
    ).toEqual(["react", "next"]);
    expect(args.includes("--js-plugins")).toBe(linter === "oxlint");
    expect(args.includes("@shadcn/lint")).toBe(linter === "oxlint");
    expect(args.slice(args.indexOf("--editors") + 1)).toEqual([
      "universal",
      "zed",
    ]);
  }
  expect(
    ultraciteArguments({ packageManager: "bun", linter: "oxlint", editors: [] })
  ).not.toContain("--editors");
});

test("records editor preferences independently of Ultracite and uses the selected manager", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "my-app",
      scripts: { dev: "next dev" },
      devDependencies: { typescript: "^5", "@types/react": "^19" },
    })
  );
  await configureProject(
    directory,
    { packageManager: "pnpm", linter: "biome", editors: ["zed"] },
    "10.0.0",
    async (root, setup) => {
      expect(root).toBe(directory);
      expect(setup.packageManager).toBe("pnpm");
      const manifest = JSON.parse(
        await readFile(join(root, "package.json"), "utf-8")
      );
      expect(manifest.packageManager).toBe("pnpm@10.0.0");
      expect(manifest.devDependencies).toEqual({
        typescript: "^7.0.2",
        "@types/react": "^19",
      });
    }
  );
  const config = JSON.parse(
    await readFile(join(directory, ".dinvolt", "config.json"), "utf-8")
  );
  expect(config).toMatchObject({
    schemaVersion: 1,
    packageManager: "pnpm",
    editors: ["zed"],
    ultracite: {
      linter: "biome",
      agents: ["universal"],
      frameworks: ["react", "next"],
      jsPlugins: [],
    },
  });
  expect(
    JSON.parse(await readFile(join(directory, "package.json"), "utf-8")).scripts
      .dev
  ).toBe("next dev");
  expect(developmentCommand("bun")).toContain("bun");
  expect(developmentCommand("npm")).toBe("npm run dev");
});

test("ESLint keeps the TypeScript 7 compiler alongside the compatible compiler API", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      devDependencies: { typescript: "^5", "@types/react": "^19" },
    })
  );
  await configureProject(
    directory,
    { packageManager: "bun", linter: "eslint", editors: [] },
    "1.4.0",
    async (root) => {
      const manifest = JSON.parse(
        await readFile(join(root, "package.json"), "utf-8")
      );
      expect(manifest.devDependencies).toEqual({
        typescript: "npm:@typescript/typescript6@^6.0.2",
        "@typescript/native": "npm:typescript@^7.0.2",
        "@types/react": "^19",
      });
    }
  );
});

test("records the selected database and ORM in the reusable project settings", async () => {
  const directory = await fixture();
  await writeFile(join(directory, "package.json"), "{}");
  await configureProject(
    directory,
    {
      packageManager: "bun",
      linter: "oxlint",
      editors: [],
      database: "planetscale-postgres",
    },
    "1.4.3",
    async () => {}
  );
  const config = JSON.parse(
    await readFile(join(directory, ".dinvolt/config.json"), "utf-8")
  );
  expect(config.database).toEqual({
    environments: ["development"],
    provider: "planetscale-postgres",
    orm: "drizzle",
  });
});

test("records Better Auth and its enabled plugins when installed in the starter", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ dependencies: { "better-auth": "1.7.10" } })
  );
  await configureProject(
    directory,
    { packageManager: "bun", linter: "oxlint", editors: [], database: "turso" },
    "1.4.3",
    async () => {}
  );
  const config = JSON.parse(
    await readFile(join(directory, ".dinvolt/config.json"), "utf-8")
  );
  expect(config.auth).toEqual({
    provider: "better-auth",
    version: "1.7.10",
    emailAndPassword: true,
    plugins: ["admin", "next-cookies"],
  });
});

test.each(["oxlint", "biome", "eslint"] as const)(
  "the installed Ultracite CLI generates a valid %s setup without extra prompts",
  async (linter) => {
    const directory = await fixture();
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "my-app",
        dependencies: { next: "16.4.2", react: "19.3.0" },
      })
    );
    const existingInstructions =
      "# Project instructions\n\nKeep the existing project conventions.\n\n<!-- BEGIN:nextjs-agent-rules -->\nRead the installed Next.js documentation.\n<!-- END:nextjs-agent-rules -->\n";
    await writeFile(join(directory, "AGENTS.md"), existingInstructions);
    // Existing settings prevent Ultracite from installing global editor extensions
    // during this test; its project configuration is still written by the real CLI.
    await mkdir(join(directory, ".vscode"));
    await writeFile(join(directory, ".vscode", "settings.json"), "{}");
    const result = spawnSync(
      "node",
      [
        ultracite,
        ...ultraciteArguments({
          packageManager: "bun",
          linter,
          editors: ["universal", "zed"],
        }),
        "--skip-install",
      ],
      {
        cwd: directory,
        encoding: "utf-8",
        timeout: 15_000,
      }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    await mkdir(join(directory, ".dinvolt/ui"), { recursive: true });
    await writeFile(join(directory, ".dinvolt/ui/config.json"), "{}");
    await configureUIStandards(directory, linter);
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf-8")
    );
    expect(Boolean(manifest.devDependencies["@shadcn/lint"])).toBe(
      linter === "oxlint"
    );
    const files = await readdir(directory);
    const extension =
      linter === "oxlint"
        ? "oxlint.config.mts"
        : linter === "biome"
          ? "biome.jsonc"
          : "eslint.config.mjs";
    expect(files).toContain(extension);
    const config = await readFile(join(directory, extension), "utf-8");
    expect(config).toContain("react");
    expect(config).toContain("next");
    for (const pattern of [".agents/skills/**", ".claude/skills/**"]) {
      expect(config).toContain(pattern);
      if (linter === "oxlint") {
        expect(
          await readFile(join(directory, "oxfmt.config.mts"), "utf-8")
        ).toContain(pattern);
      }
      if (linter === "eslint") {
        expect(
          await readFile(join(directory, ".prettierignore"), "utf-8")
        ).toContain(pattern);
      }
    }
    const settings = JSON.parse(
      await readFile(join(directory, ".vscode", "settings.json"), "utf-8")
    );
    expect(settings["editor.formatOnSave"]).toBe(true);
    expect(await readdir(join(directory, ".zed"))).toContain("settings.json");
    const instructions = await readFile(join(directory, "AGENTS.md"), "utf-8");
    expect(instructions).toContain(existingInstructions.trim());
    expect(instructions).toContain("Ultracite");
    expect(instructions).toContain("ultracite check");
    const repeated = spawnSync(
      "node",
      [
        ultracite,
        ...ultraciteArguments({
          packageManager: "bun",
          linter,
          editors: ["universal", "zed"],
        }),
        "--skip-install",
      ],
      {
        cwd: directory,
        encoding: "utf-8",
        timeout: 15_000,
      }
    );
    expect(repeated.status, repeated.stdout + repeated.stderr).toBe(0);
    expect(await readFile(join(directory, "AGENTS.md"), "utf-8")).toBe(
      instructions
    );
  }
);

test("the assembled default starter passes the consumer's real Oxlint and shadcn rules", async () => {
  const directory = await fixture();
  await mkdir(join(directory, "src/app"), { recursive: true });
  await writeFile(
    join(directory, "src/app/globals.css"),
    '@import "tailwindcss";'
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "standards-regression",
      dependencies: { next: "16.4.2", react: "19.3.0" },
    })
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { paths: { "@/*": ["./src/*"] } },
    })
  );
  await prepareStarter(directory);
  await prepareUIStarter(directory);
  await prepareDatabaseStarter(directory, "turso");
  await prepareAuthStarter(directory, "turso");
  await prepareTRPCStarter(directory);
  // Reuse installed tooling; this regression must not need a network or database.
  await symlink(
    fileURLToPath(new URL("../node_modules", import.meta.url)),
    join(directory, "node_modules"),
    "dir"
  );
  await configureProject(
    directory,
    {
      packageManager: "bun",
      linter: "oxlint",
      editors: [],
      database: "turso",
    },
    "1.4.3",
    async (cwd, setup) => {
      const result = spawnSync(
        "node",
        [ultracite, ...ultraciteArguments(setup), "--skip-install"],
        {
          cwd,
          encoding: "utf-8",
          timeout: 15_000,
        }
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }
  );
  for (const block of defaultAdminBlocks) {
    await addUIComponents(
      directory,
      [block],
      { target: "admin" },
      async (cwd, args) => {
        const profile = JSON.parse(
          await readFile(join(cwd, "components.json"), "utf-8")
        );
        const payload = JSON.parse(await readFile(args[1]!, "utf-8"));
        // Use shadcn's actual import/target transforms, including the shared icons.
        await updateFiles(
          payload.files,
          await resolveConfigPaths(cwd, profile),
          {
            plannedFiles: payload.files,
            silent: true,
            interactive: false,
          }
        );
      }
    );
  }
  await checkStarter(directory);
  // Ensure lint actually checks our own blocks; repository ignores must not leak.
  await writeFile(
    join(directory, "src/components/admin/lint-regression.tsx"),
    `
import { Button } from "@/components/admin/ui/button";
function Invalid() {
  return <Button className="bg-red-500">Invalid</Button>;
}
export default Invalid;
`
  );
  const oxlint = fileURLToPath(
    new URL("bin/oxlint", pathToFileURL(require.resolve("oxlint/package.json")))
  );
  const invalid = spawnSync("node", [oxlint], {
    cwd: directory,
    encoding: "utf-8",
    timeout: 15_000,
  });
  expect(invalid.status).not.toBe(0);
  expect(invalid.stdout + invalid.stderr).toContain("func-style");
  expect(invalid.stdout + invalid.stderr).toContain("shadcn(no-restyle)");
}, 30_000);

test("records a production-only database selection without silently adding development", async () => {
  const directory = await fixture();
  await writeFile(join(directory, "package.json"), "{}");
  await configureProject(
    directory,
    {
      packageManager: "bun",
      linter: "oxlint",
      editors: [],
      database: "turso",
      databaseEnvironments: ["production"],
    },
    "1.4.3",
    async () => {}
  );
  const config = JSON.parse(
    await readFile(join(directory, ".dinvolt/config.json"), "utf-8")
  );
  expect(config.database).toEqual({
    provider: "turso",
    orm: "drizzle",
    environments: ["production"],
  });
});
