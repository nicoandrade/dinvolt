import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import settings from "../catalog/database/config.json" with { type: "json" };
import { directoryRoot, readOrdinaryFile } from "./files.ts";

export const databases = [
  {
    value: "turso",
    label: "Turso Database",
    hint: "Drizzle + Turso serverless (default)",
  },
  {
    value: "planetscale-postgres",
    label: "PostgreSQL on PlanetScale",
    hint: "Drizzle + pg for Vercel Fluid Compute",
  },
] as const;
export type DatabaseProvider = (typeof databases)[number]["value"];
export const databaseEnvironments = [
  "development",
  "staging",
  "production",
] as const;
export type DatabaseEnvironment = (typeof databaseEnvironments)[number];
export function normalizeDatabaseEnvironments(
  environments: readonly DatabaseEnvironment[] = ["development"]
): DatabaseEnvironment[] {
  if (
    !environments.length ||
    environments.some((value) => !databaseEnvironments.includes(value))
  ) {
    throw new Error(
      "Select at least one database environment: development, staging or production."
    );
  }
  return databaseEnvironments.filter((value) => environments.includes(value));
}

export const defaultDatabase: DatabaseProvider = "turso";

export function databaseScripts(environments: readonly DatabaseEnvironment[]) {
  const scripts: Record<string, string> = {
    "db:generate": "drizzle-kit generate",
    "db:init":
      "node scripts/with-database-env.mjs development node scripts/initialize-database.mjs",
    "db:migrate":
      "node scripts/with-database-env.mjs development drizzle-kit migrate",
    "db:check": "drizzle-kit check",
    "db:studio":
      "node scripts/with-database-env.mjs development drizzle-kit studio",
  };
  for (const environment of environments.filter(
    (value) => value !== "development"
  )) {
    for (const command of ["migrate", "studio", "init"]) {
      scripts[`db:${command}:${environment}`] =
        command === "init"
          ? `node scripts/with-database-env.mjs ${environment} node scripts/initialize-database.mjs`
          : `node scripts/with-database-env.mjs ${environment} drizzle-kit ${command}`;
    }
  }
  return scripts;
}

function configureEnvironmentExample(
  files: { target: string; content: string }[],
  environments: readonly DatabaseEnvironment[]
) {
  const envFile = files.find((file) => file.target === ".env.example");
  if (!envFile) {
    throw new Error("Database environment template is missing.");
  }
  envFile.content = environments
    .map((environment) => {
      const suffix =
        environment === "development" ? "" : `_${environment.toUpperCase()}`;
      return `# Database environment: ${environment}\n${envFile.content.replaceAll(/^(?<name>DATABASE_URL(?:_DIRECT)?|TURSO_DATABASE_URL|TURSO_AUTH_TOKEN)=/gmu, `$<name>${suffix}=`)}`;
    })
    .join("\n\n");
}

export async function prepareDatabaseStarter(
  directory: string,
  provider: DatabaseProvider = defaultDatabase,
  selectedEnvironments: readonly DatabaseEnvironment[] = ["development"]
) {
  const environments = normalizeDatabaseEnvironments(selectedEnvironments);
  const database = databases.find((entry) => entry.value === provider);
  if (!database) {
    throw new Error(`Unknown database provider: ${provider}.`);
  }
  const root = await directoryRoot(directory);
  const originalManifest = await readOrdinaryFile(root, "package.json");
  if (!originalManifest || !JSON.parse(originalManifest).dependencies?.next) {
    throw new Error(
      "The database setup requires a Next.js project created with Dinvolt."
    );
  }
  const files: { target: string; content: string }[] = await Promise.all(
    (
      [
        ["index.ts", "src/db/index.ts"],
        ["schema.ts", "src/db/schema.ts"],
        ["drizzle.config.ts", "drizzle.config.ts"],
        ["env.example", ".env.example"],
      ] as const
    ).map(async ([source, target]) => ({
      target,
      content: await readFile(
        new URL(`../catalog/database/${provider}/${source}`, import.meta.url),
        "utf-8"
      ),
    }))
  );
  configureEnvironmentExample(files, environments);
  files.push(
    ...(await Promise.all(
      [
        "initial-schema.mjs",
        "initial-driver.mjs",
        "initialize-database.mjs",
      ].map(async (name) => ({
        target: `scripts/${name}`,
        content: await readFile(
          new URL(`../catalog/database/${name}`, import.meta.url),
          "utf-8"
        ),
      }))
    )),
    {
      target: "src/db/environment.ts",
      content: (
        await readFile(
          new URL("../catalog/database/environment.ts", import.meta.url),
          "utf-8"
        )
      ).replace(/\[\s*"development",?\s*\]/u, JSON.stringify(environments)),
    },
    {
      target: "scripts/with-database-env.mjs",
      content: await readFile(
        new URL("../catalog/database/with-database-env.mjs", import.meta.url),
        "utf-8"
      ),
    },
    {
      target: "docs/database.md",
      content: await readFile(
        new URL("../catalog/database/README.md", import.meta.url),
        "utf-8"
      ),
    }
  );
  for (const { target } of files) {
    if ((await readOrdinaryFile(root, target)) !== null) {
      throw new Error(
        `The database setup would replace ${target}. Existing files were preserved.`
      );
    }
  }
  const manifest = JSON.parse(originalManifest);
  const scripts = databaseScripts(environments);
  for (const name of Object.keys(scripts)) {
    if (manifest.scripts?.[name]) {
      throw new Error(
        `The database setup would replace the ${name} script. Existing files were preserved.`
      );
    }
  }
  manifest.scripts = { ...manifest.scripts, ...scripts };
  if (manifest.scripts.dev) {
    manifest.scripts.dev = `node scripts/with-database-env.mjs development ${manifest.scripts.dev}`;
  }
  manifest.dependencies = {
    ...settings.dependencies,
    ...settings.providers[provider].dependencies,
    ...manifest.dependencies,
  };
  manifest.devDependencies = {
    ...settings.devDependencies,
    ...settings.providers[provider].devDependencies,
    ...manifest.devDependencies,
  };
  const originalIgnore = await readOrdinaryFile(root, ".gitignore");
  const originalAgents = await readOrdinaryFile(root, "AGENTS.md");
  const { label } = database;
  const instructions = `<!-- BEGIN:dinvolt-database -->\n\n## Dinvolt database\n\nThis project uses Drizzle with ${label}. Configured database environments: ${environments.join(", ")}. Never fall back to another environment’s credentials. Use the explicit environment scripts for migrations, Studio and admin creation. Reuse \`getDb()\` from \`@/db\`; see [Database](docs/database.md) for schema, migrations and connection details.\n\n<!-- END:dinvolt-database -->\n`;
  const ignorePatterns = ["!.env.example"];
  const missingPatterns = ignorePatterns.filter(
    (pattern) => !originalIgnore?.split(/\r?\n/u).includes(pattern)
  );
  const written: string[] = [];
  try {
    for (const file of files) {
      await mkdir(dirname(join(root, file.target)), { recursive: true });
      await writeFile(join(root, file.target), file.content, { flag: "wx" });
      written.push(file.target);
    }
    await writeFile(
      join(root, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    if (missingPatterns.length) {
      await writeFile(
        join(root, ".gitignore"),
        `${originalIgnore?.trimEnd() ?? ""}\n\n${missingPatterns.join("\n")}\n`
      );
    }
    await writeFile(
      join(root, "AGENTS.md"),
      `${originalAgents?.trimEnd() ?? ""}\n\n${instructions}`.trimStart()
    );
  } catch (error) {
    await writeFile(join(root, "package.json"), originalManifest);
    await restoreOptionalFiles(root, [
      [".gitignore", originalIgnore],
      ["AGENTS.md", originalAgents],
    ]);
    await Promise.all(written.map((name) => rm(join(root, name))));
    throw error;
  }
}

async function restoreOptionalFiles(
  root: string,
  files: [string, string | null][]
) {
  for (const [name, source] of files) {
    if (source === null) {
      await rm(join(root, name), { force: true });
    } else {
      await writeFile(join(root, name), source);
    }
  }
}
