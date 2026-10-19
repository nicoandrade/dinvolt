import { createHash } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { registryItemSchema, registrySchema } from "shadcn/schema";

import packageJson from "../package.json" with { type: "json" };
import {
  directoryRoot,
  readOrdinaryFile,
  readOrdinaryFileBytes,
  resolveFile,
} from "./files.ts";
import { loadRegistryAssets } from "./registry-assets.ts";

const settingsPath = ".dinvolt/ui/config.json";
const hash = (content: string | Buffer) =>
  createHash("sha256").update(content).digest("hex");

export async function loadRegistryBlock(address: string, target: string) {
  const requestedName = /^@dinvolt\/(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(
    address
  )?.groups?.name;
  // The old login block now represents the complete panel. Resolve the alias
  // before loading so both names use one payload and installation identity.
  const name = requestedName === "admin-login" ? "admin-panel" : requestedName;
  if (!name) {
    throw new Error(`Unknown Dinvolt registry item: ${address}.`);
  }
  const root = await directoryRoot(
    fileURLToPath(new URL("../dist/registry/", import.meta.url))
  );
  const index = registrySchema.parse(
    JSON.parse((await readOrdinaryFile(root, "registry.json")) ?? "null")
  );
  if (index.items.filter((item) => item.name === name).length !== 1) {
    throw new Error(`Unknown Dinvolt registry item: ${address}.`);
  }
  const path = `${name}.json`;
  const source = await readOrdinaryFile(root, path);
  if (!source) {
    throw new Error(
      "The packaged Dinvolt registry is missing. Rebuild or reinstall Dinvolt."
    );
  }
  const item = registryItemSchema.parse(JSON.parse(source));
  const metadata = item.meta?.dinvolt;
  if (
    item.name !== name ||
    !["admin", "public"].includes(metadata?.target) ||
    typeof metadata?.version !== "string" ||
    !metadata.version
  ) {
    throw new Error("Invalid Dinvolt registry metadata.");
  }
  if (target !== metadata.target) {
    throw new Error(`${address} requires --target ${metadata.target}.`);
  }
  const files = (item.files ?? []).map((file) => {
    if (
      !file.target?.startsWith("~/src/") &&
      !file.target?.startsWith("~/docs/")
    ) {
      throw new Error(`Invalid registry destination: ${file.target}.`);
    }
    const destination = file.target.slice(2);
    resolveFile(root, destination);
    if (typeof file.content !== "string") {
      throw new TypeError(`Missing registry content: ${file.path}.`);
    }
    return destination;
  });
  const assets = await loadRegistryAssets(metadata.assets);
  files.push(...assets.map((asset) => asset.target));
  if (!files.length || new Set(files).size !== files.length) {
    throw new Error("Invalid registry file list.");
  }
  return {
    address: `@dinvolt/${name}`,
    name: item.name,
    version: metadata.version as string,
    path: join(root, path),
    files,
    assets,
  };
}

export type RegistryBlock = Awaited<ReturnType<typeof loadRegistryBlock>>;

async function assertAdminRoutes(
  root: string,
  owned: Set<string>,
  directory = "src/app"
) {
  for (const entry of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`The app route contains a symbolic link: ${path}.`);
    }
    if (entry.isDirectory()) {
      await assertAdminRoutes(root, owned, path);
    } else if (/^page\.(?:[cm]?[jt]sx?|mdx)$/u.test(entry.name)) {
      const segment = directory
        .slice("src/app".length)
        .split("/")
        .find((part) => part && !part.startsWith("(") && !part.startsWith("@"));
      if (segment === "admin" && !owned.has(path)) {
        throw new Error(
          `The existing admin route requires an explicit migration: ${path}. Existing files were preserved.`
        );
      }
    }
  }
}

// eslint-disable-next-line complexity -- Preserve existing orchestration branches during the lint migration.
export async function planRegistryBlock(root: string, block: RegistryBlock) {
  if (block.name === "admin-panel") {
    const manifest = JSON.parse(
      (await readOrdinaryFile(root, "package.json")) ?? "{}"
    );
    if (
      !manifest.dependencies?.["better-auth"] ||
      !manifest.dependencies?.["@tanstack/react-query"]
    ) {
      throw new Error(
        "The admin panel requires Dinvolt's Better Auth and tRPC/Query setup."
      );
    }
    for (const [path, symbol] of [
      ["src/lib/auth.ts", "getAuth"],
      ["src/lib/dev-admin.ts", "developmentAdminDefaults"],
      ["src/db/environment.ts", "getDatabaseEnvironment"],
      ["src/components/logo-iso.tsx", "LogoIso"],
      ["src/lib/auth-client.ts", "authClient"],
      ["src/lib/auth-config.ts", "logger: authLogger"],
      ["src/lib/auth-config.ts", "sendResetPassword"],
      ["src/lib/auth-logger.ts", "authLogger"],
      ["src/trpc/query-client.ts", "resetQueryCache"],
      ["src/lib/table-query.ts", "tableQuerySchema"],
      ["src/lib/users-query.ts", "usersQuerySchema"],
      ["src/lib/users-query.ts", "usersExportQuerySchema"],
      ["src/lib/csv.ts", "createCsvResponse"],
      ["src/trpc/routers/users-data.ts", "usersSelection"],
      ["src/trpc/routers/app.ts", "users: adminUsers"],
      ["src/trpc/routers/app.ts", "user: adminUser"],
      ["src/app/(admin)/layout.tsx", "admin-panel"],
    ] as const) {
      if (!(await readOrdinaryFile(root, path))?.includes(symbol)) {
        throw new Error(
          `The admin panel requires a compatible ${path}. Existing files were preserved.`
        );
      }
    }
    await assertAdminRoutes(root, new Set(block.files));
  }
  const settingsSource = await readOrdinaryFile(root, settingsPath);
  if (!settingsSource) {
    throw new Error("The Dinvolt UI configuration is missing.");
  }
  const settings = JSON.parse(settingsSource);
  // Source-only reorganization preserves installed destinations and hashes.
  // Recognize legacy receipts without replacing or re-recording owned files.
  const receipt =
    settings.blocks?.[block.name] ??
    (block.name === "admin-panel"
      ? settings.blocks?.["admin-login"]
      : undefined);
  const sharedIcons = new Set<string>();
  let unchanged = receipt?.version === block.version;
  for (const path of block.files) {
    const content = await readOrdinaryFileBytes(root, path);
    // A second area can reuse icons installed by another recorded block.
    // Unknown or customized files still require explicit manual migration.
    if (
      !receipt &&
      path.startsWith("src/components/icons/") &&
      content !== null &&
      Object.values(settings.blocks ?? {}).some(
        (entry) =>
          (entry as { files?: Record<string, string> }).files?.[path] ===
          hash(content)
      )
    ) {
      sharedIcons.add(path);
      continue;
    }
    if (
      content !== null &&
      (!unchanged || receipt.files?.[path] !== hash(content))
    ) {
      throw new Error(
        `Registry installation would replace ${path}. Review your customized block manually; --overwrite does not replace application files.`
      );
    }
    if (content === null) {
      unchanged = false;
    }
  }
  // A partially missing receipt must not authorize replacement of remaining files.
  if (!unchanged) {
    for (const path of block.files) {
      if (
        !sharedIcons.has(path) &&
        (await readOrdinaryFileBytes(root, path)) !== null
      ) {
        throw new Error(
          `The registry block is incomplete or customized: ${path}. Existing files were preserved.`
        );
      }
    }
  }
  return { unchanged, settingsSource };
}

export async function recordRegistryBlock(
  root: string,
  block: RegistryBlock,
  expectedSettings?: string
) {
  const source = await readOrdinaryFile(root, settingsPath);
  if (
    source === null ||
    (expectedSettings !== undefined && source !== expectedSettings)
  ) {
    throw new Error(
      "The Dinvolt UI configuration changed during installation. Existing edits were preserved."
    );
  }
  const settings = JSON.parse(source);
  const files: Record<string, string> = {};
  for (const path of block.files) {
    const content = await readOrdinaryFileBytes(root, path);
    if (content === null) {
      throw new Error(`The registry installation did not produce ${path}.`);
    }
    files[path] = hash(content);
  }
  settings.blocks = {
    ...settings.blocks,
    [block.name]: {
      version: block.version,
      cliVersion: packageJson.version,
      files,
    },
  };
  await writeFile(
    join(root, settingsPath),
    `${JSON.stringify(settings, null, 2)}\n`
  );
}
