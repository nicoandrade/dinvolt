import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { registryItemSchema } from "shadcn/schema";

import { developmentUrl } from "./development.ts";
import { directoryRoot, readOrdinaryFile } from "./files.ts";
import { runCommand } from "./process.ts";
import { defaultProjectType, hasAdministration } from "./project-type.ts";
import type { ProjectType } from "./project-type.ts";
import {
  loadRegistryBlock,
  planRegistryBlock,
  recordRegistryBlock,
} from "./registry.ts";
import { skillTargets } from "./skills.ts";
import { combineUIRegistryItems, resolveUIComponents } from "./ui-catalog.ts";
import {
  defaultUIPresets,
  normalizeUIPreset,
  resolveUIPreset,
} from "./ui-presets.ts";
import type { UIPresets } from "./ui-presets.ts";
import { applyUIPreset, extractUITheme, mergeUITheme } from "./ui-theme.ts";

const require = createRequire(import.meta.url);
export const uiTargets = ["admin", "public"] as const;
export type UITarget = (typeof uiTargets)[number];
export const defaultAdminBlocks = [
  "@dinvolt/admin-spinner",
  "@dinvolt/admin-panel",
] as const;

// Upstream skill examples also retain their own code and formatting standards.
const generatedUI = [
  "src/components/ui/**",
  "src/components/admin/ui/**",
  "src/hooks/use-mobile.ts",
  "src/hooks/admin/use-mobile.ts",
  "src/lib/utils.ts",
  ...skillTargets.map((target) => `${target.directory}/**`),
] as const;

// eslint-disable-next-line complexity -- Preserve existing orchestration branches during the lint migration.
export async function configureUIStandards(root: string, linter: string) {
  if (!(await readOrdinaryFile(root, ".dinvolt/ui/config.json"))) {
    return;
  }
  const patterns = generatedUI
    .map((pattern) => JSON.stringify(pattern))
    .join(", ");
  if (linter === "oxlint") {
    const lint = await readOrdinaryFile(root, "oxlint.config.mts");
    const format = await readOrdinaryFile(root, "oxfmt.config.mts");
    if (!lint || !format) {
      throw new Error(
        "The project's Ultracite Oxlint/Oxfmt configuration is missing."
      );
    }
    if (
      !lint.includes(generatedUI[0]) &&
      !lint.includes("ignorePatterns: core.ignorePatterns")
    ) {
      throw new Error(
        "Add the generated UI directories to your custom Oxlint ignorePatterns before continuing."
      );
    }
    if (!format.includes(generatedUI[0]) && !format.includes("...ultracite,")) {
      throw new Error(
        "Add the generated UI directories to your custom Oxfmt ignorePatterns before continuing."
      );
    }
    await writeFile(
      join(root, "oxlint.config.mts"),
      lint.replace(
        "ignorePatterns: core.ignorePatterns",
        `ignorePatterns: [...(core.ignorePatterns ?? []), ${patterns}]`
      )
    );
    if (!format.includes(generatedUI[0])) {
      await writeFile(
        join(root, "oxfmt.config.mts"),
        format.replace(
          "...ultracite,",
          `...ultracite,\n  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ${patterns}],`
        )
      );
    }
  } else if (linter === "biome") {
    const source = await readOrdinaryFile(root, "biome.jsonc");
    if (!source) {
      throw new Error(
        "The project's Ultracite Biome configuration is missing."
      );
    }
    let config;
    try {
      config = JSON.parse(source);
    } catch {
      throw new Error(
        "Add the generated UI directories to files.includes in your custom biome.jsonc before continuing."
      );
    }
    config.files = {
      ...config.files,
      includes: [
        ...new Set([
          ...(config.files?.includes ?? ["**"]),
          ...generatedUI.map((pattern) => `!${pattern}`),
        ]),
      ],
    };
    await writeFile(
      join(root, "biome.jsonc"),
      `${JSON.stringify(config, null, 2)}\n`
    );
  } else if (linter === "eslint") {
    const source = await readOrdinaryFile(root, "eslint.config.mjs");
    if (!source) {
      throw new Error(
        "The project's Ultracite ESLint configuration is missing."
      );
    }
    if (!source.includes(generatedUI[0])) {
      if (!source.includes("export default [")) {
        throw new Error(
          "Add the generated UI directories to the global ignores in your custom ESLint configuration before continuing."
        );
      }
      await writeFile(
        join(root, "eslint.config.mjs"),
        source.replace(
          "export default [",
          `export default [\n  { ignores: [${patterns}] },`
        )
      );
    }
    const ignore = (await readOrdinaryFile(root, ".prettierignore")) ?? "";
    const missing = generatedUI.filter(
      (pattern) => !ignore.split(/\r?\n/u).includes(pattern)
    );
    if (missing.length) {
      await writeFile(
        join(root, ".prettierignore"),
        `${ignore}${ignore && !ignore.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`
      );
    }
  }
}

export interface UIAddOptions {
  target?: UITarget;
  overwrite?: boolean;
}

export function uiProfilePath(target: UITarget) {
  return `.dinvolt/ui/${target}.json`;
}

// eslint-disable-next-line complexity -- Preserve existing orchestration branches during the lint migration.
export async function prepareUIStarter(
  directory: string,
  selected: Partial<UIPresets> = {},
  resolvePreset = resolveUIPreset,
  projectType: ProjectType = defaultProjectType
) {
  const admin = hasAdministration(projectType);
  const targets = uiTargets.filter((target) => admin || target === "public");
  const presets: Partial<UIPresets> = {
    public: normalizeUIPreset(selected.public ?? "", defaultUIPresets.public),
    ...(admin
      ? {
          admin: normalizeUIPreset(
            selected.admin ?? "",
            defaultUIPresets.admin
          ),
        }
      : {}),
  };
  const root = await directoryRoot(directory);
  const manifestSource = await readOrdinaryFile(root, "package.json");
  if (!manifestSource || !JSON.parse(manifestSource).dependencies?.next) {
    throw new Error(
      "The UI profiles require a Next.js project created with Dinvolt."
    );
  }
  const manifest = JSON.parse(manifestSource);
  // Automatic preparation is limited to the untouched Dinvolt welcome screen.
  // A customized project needs an explicit migration rather than file replacement.
  const originals: Record<string, string> = {};
  for (const name of ["layout.tsx", "page.tsx"]) {
    const source = await readOrdinaryFile(root, `src/app/${name}`);
    const expected = await readFile(
      new URL(`../catalog/next/${name}`, import.meta.url),
      "utf-8"
    );
    if (
      source === null ||
      source.replaceAll(/\s/gu, "") !== expected.replaceAll(/\s/gu, "")
    ) {
      throw new Error(
        "UI profiles are not initialized and this project's app has been customized. Create a new Dinvolt starter or migrate its layouts and UI profiles explicitly; existing files were preserved."
      );
    }
    originals[name] = source;
  }
  const globals = await readOrdinaryFile(root, "src/app/globals.css");
  if (globals?.trim() !== '@import "tailwindcss";') {
    throw new Error(
      "The project has customized CSS. Migrate its UI themes explicitly; existing files were preserved."
    );
  }
  const copies: [string, string][] = [
    ["public.json", uiProfilePath("public")],
    ...(admin
      ? [["admin.json", uiProfilePath("admin")] as [string, string]]
      : []),
    [admin ? "admin.json" : "public.json", "components.json"],
    ["config.json", ".dinvolt/ui/config.json"],
    ["utils.ts", "src/lib/utils.ts"],
    ["site.ts", "src/config/site.ts"],
    ["components/logo-complete.tsx", "src/components/logo-complete.tsx"],
    [
      admin ? "public-page.tsx" : "public-only-page.tsx",
      "src/app/(public)/page.tsx",
    ],
    ["public-layout.tsx", "src/app/(public)/layout.tsx"],
    ...(admin
      ? [["admin-layout.tsx", "src/app/(admin)/layout.tsx"] as [string, string]]
      : []),
    ["og/public-image.tsx", "src/app/(public)/opengraph-image.tsx"],
    ...(admin
      ? [
          [
            "og/admin-image.tsx",
            "src/app/(admin)/admin/opengraph-image.tsx",
          ] as [string, string],
        ]
      : []),
    ["og/image.tsx", "src/lib/og-image.tsx"],
  ];
  const files = await Promise.all(
    copies.map(async ([source, target]) => ({
      target,
      content: (
        await readFile(
          new URL(`../catalog/ui/${source}`, import.meta.url),
          "utf-8"
        )
      )
        .replaceAll("__PROJECT_NAME__", JSON.stringify(manifest.name))
        .replaceAll(
          "__DEVELOPMENT_URL__",
          JSON.stringify(developmentUrl(manifest.name))
        ),
    }))
  );
  const assets = await Promise.all(
    ["Inter-Bold.ttf", "Inter-OFL.txt"].map(async (name) => ({
      target: `assets/og/${name}`,
      content: await readFile(
        new URL(`../catalog/ui/og/${name}`, import.meta.url)
      ),
    }))
  );
  assets.push({
    target: "public/welcome-background.webp",
    content: await readFile(
      new URL("../catalog/ui/welcome-background.webp", import.meta.url)
    ),
  });
  for (const { target } of [...files, ...assets]) {
    if ((await readOrdinaryFile(root, target)) !== null) {
      throw new Error(
        `The UI setup would replace ${target}. Existing files were preserved.`
      );
    }
  }
  const settings = JSON.parse(
    await readFile(
      new URL("../catalog/ui/config.json", import.meta.url),
      "utf-8"
    )
  );
  let css = await readFile(
    new URL("../catalog/ui/globals.css", import.meta.url),
    "utf-8"
  );
  if (!admin) {
    css = extractUITheme(css, "public");
  }
  for (const target of targets) {
    if (presets[target] === defaultUIPresets[target]) {
      continue;
    }
    const preset = await resolvePreset(
      presets[target] ?? defaultUIPresets[target]
    );
    css = applyUIPreset(css, target, preset);
    settings.dependencies = {
      ...settings.dependencies,
      ...preset.dependencies,
    };
    for (const path of [
      uiProfilePath(target),
      ...(target === (admin ? "admin" : "public") ? ["components.json"] : []),
    ]) {
      // eslint-disable-next-line typescript/no-non-null-assertion -- Each profile is in the fixed copies list above.
      const file = files.find((entry) => entry.target === path)!;
      const config = JSON.parse(file.content);
      file.content = `${JSON.stringify({ ...config, ...preset.config, aliases: config.aliases, tailwind: { ...config.tailwind, ...preset.config.tailwind } }, null, 2)}\n`;
    }
  }
  settings.presets = presets;
  settings.defaultTarget = admin ? "admin" : "public";
  // eslint-disable-next-line typescript/no-non-null-assertion -- The fixed copies list always includes UI settings.
  files.find((entry) => entry.target === ".dinvolt/ui/config.json")!.content =
    `${JSON.stringify(settings, null, 2)}\n`;
  const originalAgents = await readOrdinaryFile(root, "AGENTS.md");
  let instructions = await readFile(
    new URL("../catalog/ui/agent-instructions.md", import.meta.url),
    "utf-8"
  );
  if (!admin) {
    instructions = instructions.replace(
      /### Admin area[\s\S]*?(?=### Public area)/u,
      ""
    );
  }
  manifest.dependencies = {
    ...settings.dependencies,
    ...manifest.dependencies,
  };
  const written: string[] = [];
  try {
    for (const file of [...files, ...assets]) {
      await mkdir(dirname(join(root, file.target)), { recursive: true });
      await writeFile(join(root, file.target), file.content, { flag: "wx" });
      written.push(file.target);
    }
    if (!originalAgents?.includes("<!-- BEGIN:dinvolt-ui -->")) {
      await writeFile(
        join(root, "AGENTS.md"),
        `${originalAgents?.trimEnd() ?? ""}\n\n${instructions}`.trimStart()
      );
    }
    await writeFile(
      join(root, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    await writeFile(join(root, "src/app/globals.css"), css);
    for (const name of ["layout.tsx", "page.tsx"]) {
      await rm(join(root, "src/app", name));
    }
  } catch (error) {
    for (const [name, source] of Object.entries(originals)) {
      await writeFile(join(root, "src/app", name), source);
    }
    await writeFile(join(root, "src/app/globals.css"), globals);
    await writeFile(join(root, "package.json"), manifestSource);
    if (originalAgents === null) {
      await rm(join(root, "AGENTS.md"), { force: true });
    } else {
      await writeFile(join(root, "AGENTS.md"), originalAgents);
    }
    await Promise.all(written.map((name) => rm(join(root, name))));
    throw error;
  }
}

export async function runShadcn(directory: string, args: string[]) {
  await runCommand(process.execPath, [require.resolve("shadcn"), ...args], {
    cwd: directory,
  });
}

// eslint-disable-next-line complexity -- Preserve existing orchestration branches during the lint migration.
export async function addUIComponents(
  directory: string,
  components: string[],
  options: UIAddOptions = {},
  execute = runShadcn
) {
  const root = await directoryRoot(directory);
  const settingsSource = await readOrdinaryFile(
    root,
    ".dinvolt/ui/config.json"
  );
  const settings = settingsSource ? JSON.parse(settingsSource) : undefined;
  const target = options.target ?? settings?.defaultTarget ?? "admin";
  if (
    target === "admin" &&
    settings?.defaultTarget === "public" &&
    !settings.presets?.admin
  ) {
    throw new Error(
      "This project only has a public UI profile. Use --target public."
    );
  }
  if (!uiTargets.includes(target)) {
    throw new Error(`Unknown UI target: ${target}. Use admin or public.`);
  }
  if (
    !components.length ||
    components.some(
      (name) => !/^(?:@dinvolt\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)
    )
  ) {
    throw new Error(
      "Specify one or more shadcn component names, such as button dialog input."
    );
  }
  const own = components.filter((name) => name.startsWith("@dinvolt/"));
  if (own.length && components.length !== 1) {
    throw new Error(
      "Install one Dinvolt block at a time, separately from official components."
    );
  }
  const block = own.length
    ? await loadRegistryBlock(own[0] ?? "", target)
    : undefined;
  if (!(await readOrdinaryFile(root, "package.json"))) {
    throw new Error(
      "Run dinvolt ui add from the project root, or select it with --cwd."
    );
  }
  const profilePath = uiProfilePath(target);
  let profile = await readOrdinaryFile(root, profilePath);
  // Validate managed paths before taking a lock or changing the root config.
  let original = await readOrdinaryFile(root, "components.json");
  const lock = join(root, ".dinvolt/ui/.lock");
  await mkdir(join(root, ".dinvolt/ui"), { recursive: true });
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        "Another Dinvolt UI operation is active, or a previous process stopped unexpectedly. Check .dinvolt/ui/.lock; its state.json and components.json backup describe the original configuration.",
        { cause: error }
      );
    }
    throw error;
  }
  let activated = false;
  let restored = false;
  const restoreConfig = async () => {
    await readOrdinaryFile(root, "components.json");
    if (original === null) {
      await rm(join(root, "components.json"), { force: true });
    } else {
      await writeFile(join(root, "components.json"), original);
    }
  };
  try {
    const registryPlan = block
      ? await planRegistryBlock(root, block)
      : undefined;
    if (registryPlan?.unchanged) {
      return {
        target,
        path:
          target === "admin" ? "src/components/admin/ui" : "src/components/ui",
      };
    }
    if (!profile) {
      await prepareUIStarter(root);
      // eslint-disable-next-line typescript/no-non-null-assertion -- prepareUIStarter creates the selected profile or throws.
      profile = (await readOrdinaryFile(root, profilePath))!;
      original = await readOrdinaryFile(root, "components.json");
      const setup = await readOrdinaryFile(root, ".dinvolt/config.json");
      if (setup) {
        await configureUIStandards(root, JSON.parse(setup).ultracite?.linter);
      }
    }
    const config = JSON.parse(profile);
    const componentsAlias =
      target === "admin" ? "@/components/admin" : "@/components";
    if (
      config.aliases?.components !== componentsAlias ||
      config.aliases?.ui !== `${componentsAlias}/ui`
    ) {
      throw new Error(
        `The ${target} UI profile must use components: ${componentsAlias} and ui: ${componentsAlias}/ui.`
      );
    }
    await writeFile(
      join(lock, "state.json"),
      `${JSON.stringify({ pid: process.pid, target, hadComponentsConfig: original !== null })}\n`,
      { flag: "wx" }
    );
    if (original !== null) {
      await writeFile(join(lock, "components.json"), original, { flag: "wx" });
    }
    const sharedCss =
      config.tailwind?.css === "src/app/globals.css"
        ? await readOrdinaryFile(root, "src/app/globals.css")
        : null;
    let activeProfile = profile;
    if (config.tailwind?.css === "src/app/globals.css") {
      if (sharedCss === null) {
        throw new Error(
          "The shared src/app/globals.css stylesheet is missing."
        );
      }
      await writeFile(
        join(lock, "theme.css"),
        extractUITheme(sharedCss, target),
        { flag: "wx" }
      );
      await writeFile(join(lock, "globals.css"), sharedCss, { flag: "wx" });
      activeProfile = `${JSON.stringify({ ...config, tailwind: { ...config.tailwind, css: ".dinvolt/ui/.lock/theme.css" } }, null, 2)}\n`;
    }
    activated = true;
    await writeFile(join(root, "components.json"), activeProfile);
    let installation = block ? [block.path] : components;
    const blockItem = block
      ? registryItemSchema.parse(
          JSON.parse(await readFile(block.path, "utf-8"))
        )
      : null;
    const local = await resolveUIComponents(
      target,
      config.style,
      blockItem?.registryDependencies ?? (block ? [] : components)
    );
    if (local) {
      const payloadPath = join(lock, "catalog.json");
      const payload = blockItem
        ? combineUIRegistryItems(
            { ...blockItem, registryDependencies: local.unresolved },
            local.payload
          )
        : { ...local.payload, registryDependencies: [] };
      await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, {
        flag: "wx",
      });
      installation = [payloadPath, ...(block ? [] : local.unresolved)];
    }
    await execute(root, [
      "add",
      ...installation,
      "--yes",
      ...(!block && options.overwrite ? ["--overwrite"] : []),
    ]);
    for (const asset of block?.assets ?? []) {
      await mkdir(dirname(join(root, asset.target)), { recursive: true });
      await writeFile(join(root, asset.target), asset.content, { flag: "wx" });
    }
    if (sharedCss !== null) {
      const updatedCss = await readOrdinaryFile(
        root,
        ".dinvolt/ui/.lock/theme.css"
      );
      if (updatedCss === null) {
        throw new Error(
          "The temporary shadcn theme stylesheet disappeared during installation."
        );
      }
      if ((await readOrdinaryFile(root, "src/app/globals.css")) !== sharedCss) {
        throw new Error(
          "globals.css changed during installation. Existing edits were preserved; retry the command."
        );
      }
      const merged = mergeUITheme(sharedCss, updatedCss, target);
      if (merged !== sharedCss) {
        await writeFile(join(root, "src/app/globals.css"), merged);
      }
    }
    const updated = await readOrdinaryFile(root, "components.json");
    if (updated !== null && updated !== activeProfile) {
      if ((await readOrdinaryFile(root, profilePath)) !== profile) {
        throw new Error(
          `The UI profile changed during installation: ${profilePath}. Existing edits were preserved.`
        );
      }
      const updatedConfig = JSON.parse(updated);
      if (sharedCss !== null) {
        updatedConfig.tailwind.css = "src/app/globals.css";
      }
      await writeFile(
        join(root, profilePath),
        `${JSON.stringify(updatedConfig, null, 2)}\n`
      );
    }
    if (block) {
      await restoreConfig();
      activated = false;
      // eslint-disable-next-line typescript/no-non-null-assertion -- registryPlan is created whenever block is present.
      await recordRegistryBlock(root, block, registryPlan!.settingsSource);
    }
  } finally {
    // Keep a recovery copy if restoring the original file itself fails.
    try {
      if (activated) {
        await restoreConfig();
      }
      restored = true;
    } finally {
      if (restored) {
        await rm(lock, { recursive: true });
      }
    }
  }
  return {
    target,
    path: target === "admin" ? "src/components/admin/ui" : "src/components/ui",
  };
}
