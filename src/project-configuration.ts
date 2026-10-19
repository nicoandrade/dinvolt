import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  connectionFields,
  databaseVariableName,
} from "./database-connections.ts";
import {
  databaseEnvironments,
  databases,
  normalizeDatabaseEnvironments,
  databaseScripts,
} from "./database.ts";
import type { DatabaseEnvironment, DatabaseProvider } from "./database.ts";
import {
  directoryRoot,
  readOrdinaryFile,
  requiredProjectFile,
} from "./files.ts";
import { formatProjectEdits } from "./project-format.ts";
import { packageManagers } from "./setup.ts";
import type { PackageManager } from "./setup.ts";

export interface ExistingProject {
  root: string;
  metadata: Record<string, unknown> & {
    schemaVersion: number;
    projectType?: "public" | "public-admin";
    packageManager: PackageManager;
    database?: {
      provider: DatabaseProvider;
      orm: "drizzle";
      environments: DatabaseEnvironment[];
    };
    auth?: { provider: string; plugins: string[] };
  };
  admin: boolean;
}

// eslint-disable-next-line complexity -- Validate legacy and current metadata together before trusting any recorded capability.
export async function findProject(directory: string): Promise<ExistingProject> {
  let root = await directoryRoot(directory);
  while (true) {
    const source = await readOrdinaryFile(root, ".dinvolt/config.json");
    if (source !== null) {
      let metadata;
      try {
        metadata = JSON.parse(source);
      } catch {
        throw new Error(
          "Invalid .dinvolt/config.json: expected JSON. Restore the project's metadata before running dinvolt setup."
        );
      }
      if (
        !metadata ||
        metadata.schemaVersion !== 1 ||
        !packageManagers.includes(metadata.packageManager)
      ) {
        throw new Error(
          "Unsupported Dinvolt metadata. Expected schemaVersion 1 and the original packageManager in .dinvolt/config.json."
        );
      }
      if (
        metadata.projectType !== "public" &&
        metadata.projectType !== "public-admin" &&
        (metadata.projectType !== undefined ||
          !metadata.database ||
          metadata.auth?.provider !== "better-auth" ||
          !metadata.auth?.plugins?.includes("admin"))
      ) {
        // Older starters recorded database/auth capabilities before projectType existed.
        throw new Error(
          "Missing or invalid projectType in .dinvolt/config.json. Restore the original project type; setup cannot infer or add capabilities."
        );
      }
      const admin = metadata.projectType !== "public";
      if (metadata.database) {
        const db = metadata.database;
        if (
          !databases.some(({ value }) => value === db.provider) ||
          db.orm !== "drizzle" ||
          !Array.isArray(db.environments) ||
          !db.environments.length ||
          db.environments.some(
            (env: DatabaseEnvironment) => !databaseEnvironments.includes(env)
          ) ||
          new Set(db.environments).size !== db.environments.length
        ) {
          throw new Error(
            "Invalid database metadata. Restore provider, orm and configured environments in .dinvolt/config.json."
          );
        }
      }
      if (
        (admin &&
          (!metadata.database ||
            metadata.auth?.provider !== "better-auth" ||
            !Array.isArray(metadata.auth?.plugins) ||
            !metadata.auth.plugins.includes("admin"))) ||
        (!admin && (metadata.database || metadata.auth))
      ) {
        throw new Error(
          "Inconsistent project capabilities in .dinvolt/config.json. Setup preserves the original project type; restore its metadata first."
        );
      }
      if (!(await readOrdinaryFile(root, "package.json"))) {
        throw new Error("The Dinvolt project package.json is missing.");
      }
      if (admin) {
        for (const name of [
          "scripts/initialize-database.mjs",
          "scripts/wizard-admin.mjs",
          "src/db/environment.ts",
          ".dinvolt/initial-database.json",
        ]) {
          if (!(await readOrdinaryFile(root, name))) {
            throw new Error(
              `Missing ${name}. Restore the original generated helper/initial migration metadata; setup will not regenerate or adopt migrations.`
            );
          }
        }
      }
      if (metadata.database) {
        const runtime = await requiredProjectFile(
          root,
          "src/db/environment.ts"
        );
        const declaration = runtime.match(
          /export const configuredDatabaseEnvironments\s*:\s*readonly string\[\]\s*=\s*\[(?<values>[\s\S]*?)\]/u
        );
        const configured = [
          ...(declaration?.groups?.values ?? "").matchAll(
            /["'](?<env>[^"']+)["']/gu
          ),
        ].map((match) => match.groups?.env);
        if (
          !configured.length ||
          configured.length !== metadata.database.environments.length ||
          configured.some(
            (env) => !metadata.database.environments.includes(env)
          )
        ) {
          throw new Error(
            "Database environments differ between metadata and src/db/environment.ts. Reconcile the existing configuration before running setup; no files were changed."
          );
        }
      }
      return { root, metadata, admin };
    }
    if (
      (await readOrdinaryFile(root, "package.json")) !== null ||
      dirname(root) === root
    ) {
      throw new Error(
        "No Dinvolt metadata found. Run dinvolt setup inside a generated project with .dinvolt/config.json."
      );
    }
    root = dirname(root);
  }
}

// eslint-disable-next-line complexity -- Plan all additive environment edits before writing any project files.
export async function addProjectEnvironments(
  project: ExistingProject,
  additions: readonly DatabaseEnvironment[]
) {
  const db = project.metadata.database;
  if (!db) {
    throw new Error(
      "This public project has no database environments to configure."
    );
  }
  const environments = normalizeDatabaseEnvironments([
    ...db.environments,
    ...additions,
  ]);
  if (environments.join(",") === db.environments.join(",")) {
    return;
  }
  const pending = new Map<string, string>();
  const originals = new Map<string, string | null>();
  const manifestSource = await requiredProjectFile(
    project.root,
    "package.json"
  );
  originals.set("package.json", manifestSource);
  const manifest = JSON.parse(manifestSource);
  manifest.scripts ??= {};
  const newEnvironments = environments.filter(
    (environment) => !db.environments.includes(environment)
  );
  for (const [name, command] of Object.entries(databaseScripts(environments))) {
    const belongsToNewEnvironment = newEnvironments.some((environment) =>
      environment === "development"
        ? ["db:init", "db:migrate", "db:studio"].includes(name)
        : name.endsWith(`:${environment}`)
    );
    if (belongsToNewEnvironment && !(name in manifest.scripts)) {
      manifest.scripts[name] = command;
    }
  }
  for (const environment of newEnvironments) {
    const suffix = environment === "development" ? "" : `:${environment}`;
    for (const [name, command] of Object.entries({
      [`auth:create-admin${suffix}`]: `node scripts/with-database-env.mjs ${environment} node scripts/create-admin.mjs`,
      [`auth:generate${suffix}`]: `node scripts/with-database-env.mjs ${environment} node scripts/auth-cli.mjs generate --config auth.config.ts --output src/db/auth-schema.ts --yes`,
    })) {
      if (!(name in manifest.scripts)) {
        manifest.scripts[name] = command;
      }
    }
  }
  const runtime = await requiredProjectFile(
    project.root,
    "src/db/environment.ts"
  );
  originals.set("src/db/environment.ts", runtime);
  const declaration =
    /(?<prefix>export const configuredDatabaseEnvironments\s*:\s*readonly string\[\]\s*=\s*)\[[\s\S]*?\]/u;
  if (!declaration.test(runtime)) {
    throw new Error(
      "The configuredDatabaseEnvironments declaration was customized. Add the environments to src/db/environment.ts manually before updating metadata; no files were changed."
    );
  }
  pending.set(
    "src/db/environment.ts",
    runtime.replace(declaration, `$<prefix>${JSON.stringify(environments)}`)
  );
  pending.set("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
  const originalExample = await readOrdinaryFile(project.root, ".env.example");
  originals.set(".env.example", originalExample);
  const example = originalExample ?? "";
  const placeholders = environments
    .flatMap((environment) =>
      connectionFields(db.provider).map(({ name }) =>
        databaseVariableName(name, environment)
      )
    )
    .filter(
      (name) => !new RegExp(`^(?:export\\s+)?${name}\\s*=`, "mu").test(example)
    );
  if (placeholders.length) {
    pending.set(
      ".env.example",
      `${example.trimEnd()}\n\n# Additional Dinvolt database environments\n${placeholders.map((name) => `${name}=`).join("\n")}\n`
    );
  }
  for (const name of ["docs/database.md", "docs/auth.md", "AGENTS.md"]) {
    const source = await readOrdinaryFile(project.root, name);
    if (source === null) {
      continue;
    }
    originals.set(name, source);
    const original = source.replaceAll(
      /Configured database environments: (?:development|staging|production)(?:, (?:development|staging|production))*\./gu,
      `Configured database environments: ${environments.join(", ")}.`
    );
    const section = `<!-- BEGIN:dinvolt-environments -->\nConfigured database environments: ${environments.join(", ")}. One shared schema and drizzle/ migration directory. Run dinvolt setup to complete pending credentials.\n${environments.map((env) => `- ${env}: ${project.metadata.packageManager} run db:init${env === "development" ? "" : `:${env}`}; ${project.metadata.packageManager} run auth:create-admin${env === "development" ? "" : `:${env}`}`).join("\n")}\n<!-- END:dinvolt-environments -->`;
    pending.set(
      name,
      /<!-- BEGIN:dinvolt-environments -->[\s\S]*?<!-- END:dinvolt-environments -->/u.test(
        original
      )
        ? original.replace(
            /<!-- BEGIN:dinvolt-environments -->[\s\S]*?<!-- END:dinvolt-environments -->/u,
            section
          )
        : `${original.trimEnd()}\n\n${section}\n`
    );
  }
  const metadata = { ...project.metadata, database: { ...db, environments } };
  pending.set(".dinvolt/config.json", `${JSON.stringify(metadata, null, 2)}\n`);
  const metadataSource = await requiredProjectFile(
    project.root,
    ".dinvolt/config.json"
  );
  if (
    JSON.stringify(JSON.parse(metadataSource)) !==
    JSON.stringify(project.metadata)
  ) {
    throw new Error(
      "Dinvolt metadata changed during setup. No environment files were updated; rerun setup."
    );
  }
  originals.set(".dinvolt/config.json", metadataSource);
  await formatProjectEdits(project, pending);
  for (const name of pending.keys()) {
    if ((await readOrdinaryFile(project.root, name)) !== originals.get(name)) {
      throw new Error(
        `${name} changed during setup. Existing edits were preserved; rerun setup.`
      );
    }
  }
  const written: string[] = [];
  try {
    for (const [name, content] of pending) {
      if (
        (await readOrdinaryFile(project.root, name)) !== originals.get(name)
      ) {
        throw new Error(
          `${name} changed during setup. Existing edits were preserved.`
        );
      }
      await writeFile(join(project.root, name), content);
      written.push(name);
    }
  } catch (error) {
    for (const name of written.toReversed()) {
      if ((await readOrdinaryFile(project.root, name)) !== pending.get(name)) {
        continue;
      }
      const original = originals.get(name);
      if (original === null) {
        await rm(join(project.root, name));
      } else if (original !== undefined) {
        await writeFile(join(project.root, name), original);
      }
    }
    throw error;
  }
  project.metadata = metadata;
}

export function projectDatabase(project: ExistingProject) {
  if (!project.metadata.database) {
    throw new Error("This project has no database capability.");
  }
  return project.metadata.database;
}
