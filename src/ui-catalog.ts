import { fileURLToPath } from "node:url";

import { registryItemSchema, registrySchema } from "shadcn/schema";

import { directoryRoot, readOrdinaryFile } from "./files.ts";

export type UIArea = "admin" | "public";
const styles = { admin: "base-vega", public: "base-luma" } as const;

export async function loadUIComponentCatalog(target: UIArea) {
  const root = await directoryRoot(
    fileURLToPath(
      new URL(`../catalog/ui/components/${target}/`, import.meta.url)
    )
  );
  const index = registrySchema.parse(
    JSON.parse((await readOrdinaryFile(root, "registry.json")) ?? "null")
  );
  if (
    new Set(index.items.map((item) => item.name)).size !== index.items.length
  ) {
    throw new Error("Duplicate UI catalog items.");
  }
  return { root, items: index.items, style: styles[target] };
}

function mergeObjects(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw new Error("Invalid catalog property.");
    }
    const existing = result[key];
    result[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
        ? mergeObjects(
            existing as Record<string, unknown>,
            value as Record<string, unknown>
          )
        : value;
  }
  return result;
}

// Sources stay as ordinary editable files. This is used both by the CLI and
// the internal preview; no generated copy becomes the source of truth.
export async function resolveUIComponents(
  target: UIArea,
  style: string,
  names: string[]
) {
  if (style !== styles[target]) {
    return null;
  }
  const catalog = await loadUIComponentCatalog(target);
  const chosen = new Map<string, (typeof catalog.items)[number]>();
  const unresolved = names.filter(
    (name) => !catalog.items.some((item) => item.name === name)
  );
  const visiting = new Set<string>();
  const visit = (name: string) => {
    if (chosen.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw new Error(`Circular UI dependency: ${name}.`);
    }
    const item = catalog.items.find((entry) => entry.name === name);
    if (!item) {
      throw new Error(`Missing local UI dependency: ${name}.`);
    }
    visiting.add(name);
    for (const dependency of item.registryDependencies ?? []) {
      visit(dependency);
    }
    visiting.delete(name);
    chosen.set(name, item);
  };
  for (const name of names.filter((entry) => !unresolved.includes(entry))) {
    visit(name);
  }
  if (!chosen.size) {
    return null;
  }
  const files = new Map<
    string,
    NonNullable<ReturnType<typeof registryItemSchema.parse>["files"]>[number]
  >();
  const dependencies = new Set<string>();
  const devDependencies = new Set<string>();
  let css: Record<string, unknown> = {};
  let cssVars: Record<string, unknown> = {};
  for (const item of chosen.values()) {
    for (const dependency of item.dependencies ?? []) {
      dependencies.add(dependency);
    }
    for (const dependency of item.devDependencies ?? []) {
      devDependencies.add(dependency);
    }
    css = mergeObjects(css, item.css ?? {});
    cssVars = mergeObjects(cssVars, item.cssVars ?? {});
    for (const file of item.files ?? []) {
      // Both profiles install the same editable Dinvolt spinner source.
      const content =
        item.name === "spinner"
          ? await readOrdinaryFile(
              await directoryRoot(
                fileURLToPath(new URL("../catalog/registry/", import.meta.url))
              ),
              "shared/spinner/spinner.tsx"
            )
          : await readOrdinaryFile(catalog.root, file.path);
      if (content === null) {
        throw new Error(`Missing UI catalog source: ${file.path}.`);
      }
      files.set(file.path, { ...file, content });
    }
  }
  const license = await readOrdinaryFile(
    await directoryRoot(
      fileURLToPath(new URL("../catalog/ui/components/", import.meta.url))
    ),
    "LICENSE.shadcn"
  );
  if (!license) {
    throw new Error("Missing shadcn/ui license.");
  }
  files.set("LICENSE.shadcn", {
    path: "LICENSE.shadcn",
    type: "registry:file",
    target: "~/docs/licenses/shadcn-ui.txt",
    content: license,
  });
  const payload = registryItemSchema.parse({
    name: `dinvolt-${target}-components`,
    type: "registry:block",
    files: [...files.values()],
    dependencies: [...dependencies],
    devDependencies: [...devDependencies],
    ...(Object.keys(css).length ? { css } : {}),
    ...(Object.keys(cssVars).length ? { cssVars } : {}),
  });
  return { payload, unresolved, names: [...chosen.keys()] };
}

export function combineUIRegistryItems(
  base: ReturnType<typeof registryItemSchema.parse>,
  primitives: ReturnType<typeof registryItemSchema.parse>
) {
  return registryItemSchema.parse({
    ...base,
    files: [...(primitives.files ?? []), ...(base.files ?? [])],
    dependencies: [
      ...new Set([
        ...(primitives.dependencies ?? []),
        ...(base.dependencies ?? []),
      ]),
    ],
    devDependencies: [
      ...new Set([
        ...(primitives.devDependencies ?? []),
        ...(base.devDependencies ?? []),
      ]),
    ],
    css: mergeObjects(primitives.css ?? {}, base.css ?? {}),
    cssVars: mergeObjects(primitives.cssVars ?? {}, base.cssVars ?? {}),
  });
}
