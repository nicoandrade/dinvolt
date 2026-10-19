import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import settings from "../catalog/auth/config.json" with { type: "json" };
import { normalizeDatabaseEnvironments } from "./database.ts";
import type { DatabaseEnvironment, DatabaseProvider } from "./database.ts";
import { developmentUrl } from "./development.ts";
import { directoryRoot, readOrdinaryFile } from "./files.ts";

// eslint-disable-next-line complexity -- Preserve existing orchestration branches during the lint migration.
export async function prepareAuthStarter(
  directory: string,
  provider: DatabaseProvider,
  selectedEnvironments: readonly DatabaseEnvironment[] = ["development"]
) {
  if (provider !== "turso" && provider !== "planetscale-postgres") {
    throw new Error(`Unknown auth database provider: ${provider}.`);
  }
  const environments = normalizeDatabaseEnvironments(selectedEnvironments);
  const root = await directoryRoot(directory);
  const originalManifest = await readOrdinaryFile(root, "package.json");
  const originalSchema = await readOrdinaryFile(root, "src/db/schema.ts");
  const originalConnection = await readOrdinaryFile(root, "src/db/index.ts");
  const expectedConnection = await readFile(
    new URL(`../catalog/database/${provider}/index.ts`, import.meta.url),
    "utf-8"
  );
  const expectedSchema = await readFile(
    new URL(`../catalog/database/${provider}/schema.ts`, import.meta.url),
    "utf-8"
  );
  if (
    !originalManifest ||
    !JSON.parse(originalManifest).dependencies?.next ||
    originalSchema !== expectedSchema ||
    originalConnection !== expectedConnection
  ) {
    throw new Error(
      "Auth setup requires the untouched database schema and connection of a new Dinvolt starter. Existing files were preserved."
    );
  }
  const originalEnv = await readOrdinaryFile(root, ".env.example");
  if (
    originalEnv === null ||
    /^BETTER_AUTH_(?:URL|SECRET)=/mu.test(originalEnv)
  ) {
    throw new Error(
      "Auth setup requires the database .env.example without existing Better Auth variables."
    );
  }
  if ((await readOrdinaryFile(root, ".env.local")) !== null) {
    throw new Error(
      "Auth setup would replace .env.local. Existing files were preserved."
    );
  }
  const originalIgnore = await readOrdinaryFile(root, ".gitignore");
  const originalAgents = await readOrdinaryFile(root, "AGENTS.md");
  const copies = [
    ["auth.ts", "src/lib/auth.ts"],
    ["auth-config.ts", "src/lib/auth-config.ts"],
    ["auth-client.ts", "src/lib/auth-client.ts"],
    ["auth-logger.ts", "src/lib/auth-logger.ts"],
    ["auth-origin.ts", "src/lib/auth-origin.ts"],
    ["email.ts", "src/lib/email.ts"],
    ["email-header.tsx", "src/emails/components/email-header.tsx"],
    ["reset-password-email.tsx", "src/emails/reset-password-email.tsx"],
    ["route.ts", "src/app/api/auth/[...all]/route.ts"],
    ["auth.config.ts", "auth.config.ts"],
    ["auth-cli.mjs", "scripts/auth-cli.mjs"],
    ["create-admin.mjs", "scripts/create-admin.mjs"],
    ["admin-creation.mjs", "scripts/admin-creation.mjs"],
    ["admin-bootstrap.ts", "scripts/admin-bootstrap.ts"],
    ["wizard-admin.mjs", "scripts/wizard-admin.mjs"],
    ["dev-admin.ts", "src/lib/dev-admin.ts"],
    ["README.md", "docs/auth.md"],
    [`${provider}-auth-schema.ts`, "src/db/auth-schema.ts"],
  ] as const;
  const files: { target: string; content: string }[] = await Promise.all(
    copies.map(async ([source, target]) => ({
      target,
      content: (
        await readFile(
          new URL(`../catalog/auth/${source}`, import.meta.url),
          "utf-8"
        )
      )
        .replaceAll("__PROVIDER__", provider === "turso" ? "sqlite" : "pg")
        .replaceAll(
          "__TRANSACTIONS__",
          String(provider === "planetscale-postgres")
        ),
    }))
  );
  files.push({
    target: "src/db/connection.ts",
    content: originalConnection.replace(
      'import "server-only";\n',
      "// Internal connection factory for the server-only entry point and trusted auth CLI.\n"
    ),
  });
  for (const { target } of files) {
    if ((await readOrdinaryFile(root, target)) !== null) {
      throw new Error(
        `Auth setup would replace ${target}. Existing files were preserved.`
      );
    }
  }
  const manifest = JSON.parse(originalManifest);
  const scripts: Record<string, string> = {
    "auth:generate":
      "node scripts/with-database-env.mjs development node scripts/auth-cli.mjs generate --config auth.config.ts --output src/db/auth-schema.ts --yes",
    "auth:create-admin":
      "node scripts/with-database-env.mjs development node scripts/create-admin.mjs",
  };
  for (const environment of environments.filter(
    (value) => value !== "development"
  )) {
    scripts[`auth:generate:${environment}`] =
      `node scripts/with-database-env.mjs ${environment} node scripts/auth-cli.mjs generate --config auth.config.ts --output src/db/auth-schema.ts --yes`;
    scripts[`auth:create-admin:${environment}`] =
      `node scripts/with-database-env.mjs ${environment} node scripts/create-admin.mjs`;
  }
  for (const name of Object.keys(scripts)) {
    if (name in (manifest.scripts ?? {})) {
      throw new Error(
        `Auth setup would replace the ${name} script. Existing files were preserved.`
      );
    }
  }
  manifest.dependencies = {
    ...settings.dependencies,
    ...manifest.dependencies,
  };
  manifest.devDependencies = {
    ...settings.devDependencies,
    ...manifest.devDependencies,
  };
  manifest.scripts = { ...manifest.scripts, ...scripts };
  const schema = await readFile(
    new URL(`../catalog/auth/${provider}-schema.ts`, import.meta.url),
    "utf-8"
  );
  const env = await readFile(
    new URL("../catalog/auth/env.example", import.meta.url),
    "utf-8"
  );
  const exampleEnv = `${originalEnv.trimEnd()}\n${env.replaceAll("__DEVELOPMENT_URL__", developmentUrl(manifest.name))}`;
  const secret = randomBytes(32).toString("base64");
  files.push({
    target: ".env.local",
    content: exampleEnv.replace(
      /^BETTER_AUTH_SECRET=$/mu,
      `BETTER_AUTH_SECRET=${secret}`
    ),
  });
  const instructions =
    "<!-- BEGIN:dinvolt-auth -->\n\n## Dinvolt authentication\n\nThis project uses Better Auth with email/password and the Admin plugin. Reuse the existing server/client helpers; see [Authentication](docs/auth.md) for sessions, permissions and schema changes.\n\n<!-- END:dinvolt-auth -->\n";
  const written: string[] = [];
  try {
    for (const file of files) {
      await mkdir(dirname(join(root, file.target)), { recursive: true });
      await writeFile(join(root, file.target), file.content, {
        flag: "wx",
        ...(file.target === ".env.local" ? { mode: 0o600 } : {}),
      });
      written.push(file.target);
    }
    await writeFile(join(root, "src/db/schema.ts"), schema);
    await writeFile(
      join(root, "src/db/index.ts"),
      await readFile(
        new URL("../catalog/auth/db-index.ts", import.meta.url),
        "utf-8"
      )
    );
    await writeFile(join(root, ".env.example"), exampleEnv);
    if (!originalIgnore?.split(/\r?\n/u).includes(".env.local")) {
      await writeFile(
        join(root, ".gitignore"),
        `${originalIgnore?.trimEnd() ?? ""}\n\n.env.local\n`
      );
    }
    await writeFile(
      join(root, "AGENTS.md"),
      `${originalAgents?.trimEnd() ?? ""}\n\n${instructions}`.trimStart()
    );
    await writeFile(
      join(root, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  } catch (error) {
    await writeFile(join(root, "package.json"), originalManifest);
    await writeFile(join(root, "src/db/schema.ts"), originalSchema);
    await writeFile(join(root, "src/db/index.ts"), originalConnection);
    await writeFile(join(root, ".env.example"), originalEnv);
    if (originalIgnore === null) {
      await rm(join(root, ".gitignore"), { force: true });
    } else {
      await writeFile(join(root, ".gitignore"), originalIgnore);
    }
    if (originalAgents === null) {
      await rm(join(root, "AGENTS.md"), { force: true });
    } else {
      await writeFile(join(root, "AGENTS.md"), originalAgents);
    }
    await Promise.all(written.map((name) => rm(join(root, name))));
    throw error;
  }
}
