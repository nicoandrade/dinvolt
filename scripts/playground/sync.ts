import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveConfigPaths } from "@shadcn/registry/internal/get-config";
import { updateFiles } from "@shadcn/registry/internal/updaters/update-files";
import { registrySchema } from "shadcn/schema";

import authSettings from "../../catalog/auth/config.json" with { type: "json" };
import { developmentUrl } from "../../src/development.ts";
import { runCommand } from "../../src/process.ts";
import { loadRegistryAssets } from "../../src/registry-assets.ts";
import { withTRPCProvider } from "../../src/trpc.ts";
import {
  loadUIComponentCatalog,
  resolveUIComponents,
} from "../../src/ui-catalog.ts";
import { addUIComponents } from "../../src/ui.ts";

export const repository = fileURLToPath(new URL("../../", import.meta.url));
export const playgroundDirectory = join(repository, "demos/dinvolt-playground");
const marker = ".dinvolt/internal-playground.json";

export async function writeChanged(path: string, content: string | Buffer) {
  try {
    if ((await readFile(path)).equals(Buffer.from(content))) {
      return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function syncRegistryAssets(
  directory: string,
  files: string[],
  metadata?: { dinvolt?: { assets?: Parameters<typeof loadRegistryAssets>[0] } }
) {
  const assets = await loadRegistryAssets(metadata?.dinvolt?.assets);
  for (const asset of assets) {
    files.push(asset.target);
    await writeChanged(join(directory, asset.target), asset.content);
  }
}

export async function assertPlayground(directory: string) {
  const state = JSON.parse(await readFile(join(directory, marker), "utf-8"));
  if (
    state.owner !== "dinvolt-internal-playground" ||
    resolve(directory) !== playgroundDirectory ||
    !Array.isArray(state.files) ||
    state.files.some(
      (path: unknown) =>
        typeof path !== "string" ||
        !resolve(directory, path).startsWith(`${directory}/`)
    )
  ) {
    throw new Error("Refusing to synchronize outside the internal playground.");
  }
  return state as { owner: string; files: string[]; dependencies?: string };
}

export async function markPlayground(directory: string) {
  await writeChanged(
    join(directory, marker),
    `${JSON.stringify({ owner: "dinvolt-internal-playground", files: [] }, null, 2)}\n`
  );
}

async function copyTree(
  source: string,
  target: string,
  files: string[],
  directory: string
) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const destination = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyTree(join(source, entry.name), destination, files, directory);
    } else if (entry.isFile()) {
      await writeChanged(
        join(directory, destination),
        await readFile(join(source, entry.name))
      );
      files.push(destination);
    }
  }
}

async function copyProfileTree(
  source: string,
  target: string,
  area: "admin" | "public",
  files: string[],
  directory: string
) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const destination = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyProfileTree(
        join(source, entry.name),
        destination,
        area,
        files,
        directory
      );
    } else if (entry.isFile()) {
      const content = (await readFile(join(source, entry.name), "utf-8"))
        .replaceAll(
          "@/components/ui/",
          area === "admin" ? "@/components/admin/ui/" : "@/components/ui/"
        )
        .replaceAll(
          "@/hooks/",
          area === "admin" ? "@/hooks/admin/" : "@/hooks/"
        )
        .replaceAll("@/playground/showcase/", `@/playground/showcase/${area}/`)
        .replaceAll("__DINVOLT_STYLE__", area === "admin" ? "vega" : "luma");
      await writeChanged(join(directory, destination), content);
      files.push(destination);
    }
  }
}

async function syncPublicActionPreviews(directory: string, files: string[]) {
  // Reuse the action scenarios with public imports; admin components never
  // enter the public preview's module graph.
  for (const name of ["action-button", "delete-button"]) {
    const path = `src/playground/public-${name}-preview.tsx`;
    const source = await readFile(
      join(repository, `playground/components/${name}-preview.tsx`),
      "utf-8"
    );
    await writeChanged(
      join(directory, path),
      source.replaceAll("@/components/admin/ui/", "@/components/ui/")
    );
    files.push(path);
  }
}

async function syncUITemplates(directory: string, files: string[]) {
  const manifest = JSON.parse(
    await readFile(join(directory, "package.json"), "utf-8")
  );
  for (const [source, target] of [
    ["site.ts", "src/config/site.ts"],
    ["public-page.tsx", "src/app/(public)/page.tsx"],
    ["components/logo-complete.tsx", "src/components/logo-complete.tsx"],
    ["og/public-image.tsx", "src/app/(public)/opengraph-image.tsx"],
    ["og/admin-image.tsx", "src/app/(admin)/admin/opengraph-image.tsx"],
    ["admin-layout.tsx", "src/app/(admin)/layout.tsx"],
    ["public-layout.tsx", "src/app/(public)/layout.tsx"],
  ] as const) {
    const template = await readFile(
      join(repository, "catalog/ui", source),
      "utf-8"
    );
    const content = template
      .replaceAll("__PROJECT_NAME__", JSON.stringify(manifest.name))
      .replaceAll(
        "__DEVELOPMENT_URL__",
        JSON.stringify(developmentUrl(manifest.name))
      );
    await writeChanged(
      join(directory, target),
      source.endsWith("-layout.tsx") ? withTRPCProvider(content) : content
    );
    files.push(target);
  }
  const background = "public/welcome-background.webp";
  await writeChanged(
    join(directory, background),
    await readFile(join(repository, "catalog/ui/welcome-background.webp"))
  );
  files.push(background);
}

export async function syncPlayground(directory = playgroundDirectory) {
  const previous = await assertPlayground(directory);
  const registry = registrySchema.parse(
    JSON.parse(
      await readFile(
        join(repository, "catalog/registry/registry.json"),
        "utf-8"
      )
    )
  );
  const files: string[] = [];
  const css = await readFile(join(repository, "catalog/ui/globals.css"));
  const profiles = await Promise.all(
    ["admin", "public"].map(async (area) => ({
      area,
      content: await readFile(
        join(repository, `catalog/ui/${area}.json`),
        "utf-8"
      ),
    }))
  );
  const catalogs = {
    admin: await loadUIComponentCatalog("admin"),
    public: await loadUIComponentCatalog("public"),
  };
  const dependencies = createHash("sha256")
    .update(css)
    .update(JSON.stringify(authSettings.dependencies))
    .update(JSON.stringify(profiles))
    .update(JSON.stringify([catalogs.admin.items, catalogs.public.items]))
    .update(
      JSON.stringify(
        registry.items.map((item) => ({
          target: item.meta?.dinvolt?.target,
          dependencies: item.dependencies,
          registryDependencies: item.registryDependencies,
        }))
      )
    )
    .digest("hex");
  if (dependencies !== previous.dependencies) {
    await writeChanged(join(directory, "src/app/globals.css"), css);
    for (const profile of profiles) {
      await writeChanged(
        join(directory, `.dinvolt/ui/${profile.area}.json`),
        profile.content
      );
    }
    for (const target of ["admin", "public"] as const) {
      const primitives = catalogs[target].items
        .filter((item) => item.type === "registry:ui")
        .map((item) => item.name);
      if (primitives.length) {
        await addUIComponents(directory, primitives, {
          target,
          overwrite: true,
        });
      }
    }
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf-8")
    );
    const missing = [
      ...new Set([
        ...registry.items.flatMap((item) => item.dependencies ?? []),
        ...Object.entries(authSettings.dependencies).map(
          ([name, version]) => `${name}@${version}`
        ),
      ]),
    ].filter((dependency) => {
      const separator = dependency.lastIndexOf("@");
      return (
        separator <= 0 ||
        manifest.dependencies?.[dependency.slice(0, separator)] !==
          dependency.slice(separator + 1)
      );
    });
    if (missing.length) {
      await runCommand("bun", ["add", ...missing], { cwd: directory });
    }
  }
  for (const area of ["admin", "public"] as const) {
    const config = await resolveConfigPaths(
      directory,
      // eslint-disable-next-line typescript/no-non-null-assertion -- Both UI profiles are created before catalog synchronization.
      JSON.parse(profiles.find((profile) => profile.area === area)!.content)
    );
    const resolved = await resolveUIComponents(
      area,
      config.style,
      catalogs[area].items.map((item) => item.name)
    );
    if (!resolved) {
      throw new Error("Missing default component catalog.");
    }
    await updateFiles(resolved.payload.files, config, {
      overwrite: true,
      silent: true,
      interactive: false,
    });
    await copyProfileTree(
      join(repository, "playground/showcase"),
      `src/playground/showcase/${area}`,
      area,
      files,
      directory
    );
    await copyProfileTree(
      join(repository, "playground/component-examples"),
      `src/playground/component-examples/${area}`,
      area,
      files,
      directory
    );
    const exampleFiles = (
      await readdir(join(repository, "playground/component-examples"))
    ).filter((file) => file.endsWith("-example.tsx"));
    const imports = exampleFiles
      .map(
        (file) =>
          `${JSON.stringify(file.replace("-example.tsx", ""))}: dynamic(() => import("@/playground/component-examples/${area}/${file.replace(".tsx", "")}"), { loading: Placeholder })`
      )
      .join(",\n");
    const componentIndex = `"use client";\nimport dynamic from "next/dynamic";\nimport { useLayoutEffect } from "react";\nimport Showcase from "@/playground/showcase/${area}/index";\nimport { Skeleton } from "${config.aliases.ui}/skeleton";\nimport { TooltipProvider } from "${config.aliases.ui}/tooltip";\nimport { Toaster } from "${config.aliases.ui}/sonner";\nconst Placeholder = () => <div className="grid min-h-svh gap-6 p-8 md:grid-cols-2"><Skeleton className="h-80"/><Skeleton className="h-80"/></div>;\nconst components: Record<string, React.ComponentType> = {${imports}};\nexport function CatalogPreview({name, dark}: {name: string; dark: boolean}) {\nuseLayoutEffect(() => {document.documentElement.classList.toggle("dark", dark)}, [dark]);\nconst Component = name === "showcase" ? Showcase : components[name];\nreturn <TooltipProvider><main aria-label="${area} component preview">{Component ? <Component/> : null}</main><Toaster theme={dark ? "dark" : "light"}/></TooltipProvider>;\n}\n`;
    const path = `src/playground/catalog-${area}.tsx`;
    await writeChanged(join(directory, path), componentIndex);
    files.push(path);
  }
  const catalogItems = catalogs.admin.items
    .filter((item) => item.type === "registry:ui")
    .map((item) => ({
      id: item.name,
      title: item.name
        .replaceAll("-", " ")
        .replaceAll(/\b\w/gu, (char) => char.toUpperCase()),
    }));
  await writeChanged(
    join(directory, "src/playground/catalog-items.ts"),
    `export const catalogItems = ${JSON.stringify(catalogItems, null, 2)} as const;\n`
  );
  files.push("src/playground/catalog-items.ts");
  // The same updater used by `shadcn add`: aliases, styles and cross-file imports
  // are resolved by upstream, rather than a second set of regex replacements.
  for (const item of registry.items) {
    const target = item.meta?.dinvolt?.target;
    if (target !== "admin" && target !== "public") {
      throw new Error(`Missing preview target for ${item.name}.`);
    }
    const profile = JSON.parse(
      await readFile(join(directory, `.dinvolt/ui/${target}.json`), "utf-8")
    );
    const config = await resolveConfigPaths(directory, profile);
    const sources = await Promise.all(
      (item.files ?? []).map(async (file) => {
        if (
          !file.target?.startsWith("~/src/") &&
          !file.target?.startsWith("~/docs/")
        ) {
          throw new Error(`Unsupported preview destination: ${file.target}.`);
        }
        files.push(file.target.slice(2));
        return {
          ...file,
          content: await readFile(
            join(repository, "catalog/registry", file.path),
            "utf-8"
          ),
        };
      })
    );
    await syncRegistryAssets(directory, files, item.meta);
    const primitives = await readdir(config.resolvedPaths.ui);
    const plannedFiles = [
      ...sources,
      ...(await Promise.all(
        primitives
          .filter((name) => /\.[jt]sx?$/u.test(name))
          .map(async (name) => ({
            path: `ui/${name}`,
            target: `~/${target === "admin" ? "src/components/admin/ui" : "src/components/ui"}/${name}`,
            type: "registry:ui" as const,
            content: await readFile(
              join(config.resolvedPaths.ui, name),
              "utf-8"
            ),
          }))
      )),
    ];
    await updateFiles(sources, config, {
      plannedFiles,
      overwrite: true,
      force: true,
      silent: true,
      interactive: false,
    });
  }
  for (const [source, target] of [
    ["catalog/database/environment.ts", "src/db/environment.ts"],
    ["catalog/auth/auth.ts", "src/lib/auth.ts"],
    ["catalog/auth/dev-admin.ts", "src/lib/dev-admin.ts"],
    ["catalog/auth/auth-config.ts", "src/lib/auth-config.ts"],
    ["catalog/auth/email.ts", "src/lib/email.ts"],
    ["catalog/auth/email-header.tsx", "src/emails/components/email-header.tsx"],
    [
      "catalog/auth/reset-password-email.tsx",
      "src/emails/reset-password-email.tsx",
    ],
    ["catalog/auth/README.md", "docs/auth.md"],
    ["catalog/auth/route.ts", "src/app/api/auth/[...all]/route.ts"],
    ["catalog/trpc/table-query.ts", "src/lib/table-query.ts"],
    ["catalog/trpc/users-query.ts", "src/lib/users-query.ts"],
    ["catalog/trpc/users.ts", "src/trpc/routers/users.ts"],
    ["catalog/trpc/users-data.ts", "src/trpc/routers/users-data.ts"],
    ["catalog/trpc/csv.ts", "src/lib/csv.ts"],
    ["catalog/trpc/router.ts", "src/trpc/routers/app.ts"],
    ["catalog/ui/components/logo-iso.tsx", "src/components/logo-iso.tsx"],
    ["catalog/next/icons.ts", "src/lib/icons.ts"],
    ["catalog/next/icon-image.tsx", "src/lib/icon-image.tsx"],
    ["catalog/next/icon-route.tsx", "src/app/icons/[variant]/route.tsx"],
    ["catalog/ui/og/image.tsx", "src/lib/og-image.tsx"],
  ] as const) {
    files.push(target);
    await writeChanged(
      join(directory, target),
      (await readFile(join(repository, source), "utf-8"))
        .replaceAll("__PROVIDER__", "sqlite")
        .replaceAll("__TRANSACTIONS__", "false")
    );
  }
  for (const icon of ["favicon.ico", "icon.svg", "apple-icon.png"]) {
    await rm(join(directory, "src/app", icon), { force: true });
  }
  await syncUITemplates(directory, files);
  await copyTree(
    join(repository, "playground/app"),
    "src/app",
    files,
    directory
  );
  await copyTree(
    join(repository, "playground/components"),
    "src/playground",
    files,
    directory
  );
  await syncPublicActionPreviews(directory, files);
  await copyTree(
    join(repository, "playground/public"),
    "public",
    files,
    directory
  );
  const logo = "public/dinvolt-logo.svg";
  await writeChanged(
    join(directory, logo),
    await readFile(join(repository, "assets/logo.svg"))
  );
  files.push(logo);
  for (const path of previous.files) {
    if (!files.includes(path)) {
      await rm(join(directory, path), { force: true });
    }
  }
  await writeChanged(
    join(directory, marker),
    `${JSON.stringify({ owner: previous.owner, files, dependencies }, null, 2)}\n`
  );
}
