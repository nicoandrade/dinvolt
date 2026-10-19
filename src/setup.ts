import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { detectPackageManager, runScriptCommand } from "nypm";

import type { DatabaseEnvironment, DatabaseProvider } from "./database.ts";
import { developmentUrl } from "./development.ts";
import { runCommand } from "./process.ts";
import { defaultProjectType, hasAdministration } from "./project-type.ts";
import type { ProjectType } from "./project-type.ts";
import { projectSkills } from "./skills.ts";
import { configureUIStandards } from "./ui.ts";

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const ultraciteCli = () =>
  fileURLToPath(
    new URL(
      "../../dist/index.js",
      pathToFileURL(require.resolve("ultracite/oxfmt"))
    )
  );
export const packageManagers = [
  "bun",
  "npm",
  "pnpm",
  "yarn",
  "deno",
  "nub",
  "aube",
] as const;
export type PackageManager = (typeof packageManagers)[number];
export const linters = [
  { value: "oxlint", label: "Oxlint + Oxfmt (Recommended)" },
  { value: "biome", label: "Biome" },
  { value: "eslint", label: "ESLint + Prettier + Stylelint" },
] as const;
export type Linter = (typeof linters)[number]["value"];
// Ultracite groups editors by their settings file rather than duplicating it.
export const editors = [
  {
    value: "universal",
    label: "Universal",
    hint: ".vscode/settings.json for Visual Studio Code, Cursor, Devin Desktop, and more",
  },
  { value: "zed", label: "Zed", hint: ".zed/settings.json" },
] as const;
export type Editor = (typeof editors)[number]["value"];

export interface ProjectSetup {
  projectType?: ProjectType;
  packageManager: PackageManager;
  linter: Linter;
  editors: Editor[];
  database?: DatabaseProvider;
  databaseEnvironments?: DatabaseEnvironment[];
  skills?: boolean;
}

export async function detectProjectPackageManager(
  directory: string
): Promise<PackageManager | undefined> {
  const detected = await detectPackageManager(directory, {
    includeParentDirs: false,
    ignoreArgv: true,
  });
  return packageManagers.find((name) => name === detected?.name);
}

export async function checkPackageManager(
  name: PackageManager
): Promise<string> {
  try {
    // Some managers reject a different manager declared by the CLI's own
    // project. Probe outside that project so changing managers remains valid.
    const { stdout } = await execute(name, ["--version"], {
      cwd: tmpdir(),
      timeout: 10_000,
    });
    const version = stdout.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?/u)?.[0];
    if (version) {
      return version;
    }
  } catch {
    /* Report an actionable error before creating the destination. */
  }
  throw new Error(
    `${name} is required for the selected starter. Install ${name} and run dinvolt create again.`
  );
}

export function ultraciteArguments(setup: ProjectSetup) {
  return [
    "init",
    "--yes",
    "--quiet",
    "--pm",
    setup.packageManager,
    "--linter",
    setup.linter,
    "--agents",
    "universal",
    "--frameworks",
    "react",
    "next",
    ...(setup.linter === "oxlint" ? ["--js-plugins", "@shadcn/lint"] : []),
    ...(setup.editors.length ? ["--editors", ...setup.editors] : []),
  ];
}

async function runUltracite(directory: string, setup: ProjectSetup) {
  // Locate the installed CLI through a public export; Ultracite doesn't export
  // its package.json or dist entry. Keep its resources outside the CLI bundle.
  await runCommand(
    process.execPath,
    [ultraciteCli(), ...ultraciteArguments(setup)],
    { cwd: directory }
  );
}

export async function prepareStarter(
  directory: string,
  manager: PackageManager = "bun",
  projectType: ProjectType = defaultProjectType
) {
  const manifestPath = join(directory, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  const url = developmentUrl(manifest.name);
  // An explicit hostname also works for project names such as "run" or "proxy",
  // which would otherwise be interpreted as Portless subcommands.
  manifest.scripts = {
    ...manifest.scripts,
    dev: `portless ${new URL(url).hostname} next dev`,
  };
  manifest.devDependencies = {
    ...manifest.devDependencies,
    portless: "0.15.8",
  };
  manifest.engines = { ...manifest.engines, node: ">=24" };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [sourceName, target] of [
    ["page.tsx", "src/app/page.tsx"],
    ["layout.tsx", "src/app/layout.tsx"],
    ["icons.ts", "src/lib/icons.ts"],
    ["icon-image.tsx", "src/lib/icon-image.tsx"],
    ["icon-route.tsx", "src/app/icons/[variant]/route.tsx"],
    ["next.config.ts", "next.config.ts"],
  ] as const) {
    const source = new URL(`../catalog/next/${sourceName}`, import.meta.url);
    await mkdir(dirname(join(directory, target)), { recursive: true });
    await writeFile(join(directory, target), await readFile(source));
  }
  await rm(join(directory, "src/app/favicon.ico"), { force: true });
  await mkdir(join(directory, "src/components"), { recursive: true });
  await writeFile(
    join(directory, "src/components/logo-iso.tsx"),
    await readFile(
      new URL("../catalog/ui/components/logo-iso.tsx", import.meta.url)
    )
  );
  await mkdir(join(directory, "docs/licenses"), { recursive: true });
  await writeFile(
    join(directory, "docs/licenses/dinvolt.txt"),
    await readFile(new URL("../LICENSE", import.meta.url))
  );
  const guide = await readFile(
    new URL("../catalog/next/development.md", import.meta.url),
    "utf-8"
  );
  await writeFile(
    join(directory, "docs/development.md"),
    (hasAdministration(projectType)
      ? guide
      : `${guide.replace(/<!-- BEGIN:auth -->[\s\S]*?<!-- END:auth -->/u, "").trimEnd()}\n`
    ).replaceAll("__DEVELOPMENT_URL__", url)
  );
  const readme = await readFile(
    new URL(
      `../catalog/next/${hasAdministration(projectType) ? "README.md" : "README-public.md"}`,
      import.meta.url
    ),
    "utf-8"
  );
  await writeFile(
    join(directory, "README.md"),
    readme
      .replaceAll("{{PROJECT_NAME}}", manifest.name)
      .replaceAll("{{DEVELOPMENT_URL}}", url)
      .replaceAll("{{PACKAGE_MANAGER}}", manager)
      .replaceAll(/\{\{SCRIPT:(?<script>[\w:-]+)\}\}/gu, (_, script: string) =>
        runScriptCommand(manager, script)
      )
      .replaceAll(
        "{{CREATE_ADMIN_COMMAND}}",
        runScriptCommand(manager, "auth:create-admin", {
          args: [
            ...(manager === "npm" ? ["--"] : []),
            "--email",
            "admin@example.com",
            "--name",
            "Admin",
          ],
        })
      )
  );
}

export async function checkStarter(directory: string) {
  await runCommand(process.execPath, [ultraciteCli(), "fix"], {
    cwd: directory,
  });
  await runCommand(process.execPath, [ultraciteCli(), "check"], {
    cwd: directory,
  });
}

export async function configureProject(
  directory: string,
  setup: ProjectSetup,
  managerVersion: string,
  configure = runUltracite
) {
  const manifestPath = join(directory, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  manifest.packageManager = `${setup.packageManager}@${managerVersion}`;
  // Override create-next-app's TypeScript 5 range before dependencies and the
  // selected manager's lockfile are installed by Ultracite.
  manifest.devDependencies = {
    ...manifest.devDependencies,
    typescript:
      setup.linter === "eslint"
        ? "npm:@typescript/typescript6@^6.0.2"
        : "^7.0.2",
    // typescript-eslint needs the classic API. The official compatibility alias
    // exposes that API while @typescript/native provides TypeScript 7's tsc.
    ...(setup.linter === "eslint"
      ? { "@typescript/native": "npm:typescript@^7.0.2" }
      : {}),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await configure(directory, setup);
  if (setup.linter === "eslint") {
    await writeFile(
      join(directory, "eslint.config.mjs"),
      await readFile(
        new URL("../catalog/next/eslint.config.mjs", import.meta.url)
      )
    );
  }
  await configureUIStandards(directory, setup.linter);
  await mkdir(join(directory, ".dinvolt"), { recursive: true });
  await writeFile(
    join(directory, ".dinvolt", "config.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        projectType: setup.projectType ?? defaultProjectType,
        packageManager: setup.packageManager,
        editors: setup.editors,
        skills: {
          enabled: setup.skills !== false,
          sources: projectSkills(setup),
        },
        ...(setup.database
          ? {
              database: {
                provider: setup.database,
                orm: "drizzle",
                environments: setup.databaseEnvironments ?? ["development"],
              },
            }
          : {}),
        ...(manifest.dependencies?.["better-auth"]
          ? {
              auth: {
                provider: "better-auth",
                version: manifest.dependencies["better-auth"],
                emailAndPassword: true,
                plugins: ["admin", "next-cookies"],
              },
            }
          : {}),
        ...(manifest.dependencies?.["@trpc/server"]
          ? {
              api: {
                provider: "trpc",
                version: manifest.dependencies["@trpc/server"],
                query: "tanstack-query",
                queryVersion: manifest.dependencies["@tanstack/react-query"],
              },
            }
          : {}),
        ultracite: {
          version: "8.0.1",
          linter: setup.linter,
          agents: ["universal"],
          frameworks: ["react", "next"],
          jsPlugins: setup.linter === "oxlint" ? ["@shadcn/lint"] : [],
        },
      },
      null,
      2
    )}\n`,
    { flag: "wx" }
  );
}

export function developmentCommand(manager: PackageManager) {
  return runScriptCommand(manager, "dev");
}
