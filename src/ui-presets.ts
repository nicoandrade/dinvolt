import { createRequire } from "node:module";

import { decodePreset, isValidPreset } from "shadcn/preset";
import type * as ShadcnRegistry from "shadcn/registry";

import defaults from "../catalog/ui/config.json" with { type: "json" };

export const defaultUIPresets = defaults.presets;
export type UIPresets = typeof defaultUIPresets;

export function normalizeUIPreset(input: string, fallback: string) {
  const value = input.trim();
  if (!value) {
    return fallback;
  }
  const code = /^(?:--preset(?:\s+|=))?(?<code>[a-zA-Z0-9]+)$/u.exec(value)
    ?.groups?.code;
  if (!code || !isValidPreset(code)) {
    throw new Error(
      "Paste a valid shadcn preset code, such as b0 or --preset bImMZYe, or leave empty to use the Dinvolt default."
    );
  }
  return code;
}

export interface ResolvedUIPreset {
  config: {
    style: string;
    iconLibrary?: string;
    menuColor?: string;
    menuAccent?: string;
    tailwind?: { baseColor?: string };
  };
  light: Record<string, string>;
  dark: Record<string, string>;
  fonts: { variable: string; family: string; dependency: string }[];
  dependencies: Record<string, string>;
}

// Use the pinned CLI's public registry API and the same /init payload it uses.
// Dependencies are installed once, later, by the user's selected package manager.
// eslint-disable-next-line complexity -- Preserve existing orchestration branches during the lint migration.
export async function resolveUIPreset(code: string): Promise<ResolvedUIPreset> {
  const preset = decodePreset(normalizeUIPreset(code, ""));
  if (!preset) {
    throw new Error(`Invalid shadcn preset: ${code}.`);
  }
  const url = new URL("https://ui.shadcn.com/init");
  for (const [key, value] of Object.entries({
    ...preset,
    base: "base",
    template: "next",
    preset: code,
    rtl: false,
  })) {
    url.searchParams.set(key, String(value));
  }
  const require = createRequire(import.meta.url);
  const { getRegistryItems } = (await import(
    require.resolve("shadcn/registry")
  )) as typeof ShadcnRegistry;
  const [item] = await getRegistryItems([url.href]);
  if (
    item?.type !== "registry:base" ||
    !item.config?.style ||
    !item.cssVars?.light ||
    !item.cssVars.dark
  ) {
    throw new Error(`shadcn returned an incomplete preset: ${code}.`);
  }
  const fontNames =
    item.registryDependencies?.filter((name) => name.startsWith("font-")) ?? [];
  const fontItems = await getRegistryItems(fontNames, {
    config: { style: item.config.style },
  });
  const fonts: ResolvedUIPreset["fonts"] = [];
  for (const font of fontItems) {
    if (font.type !== "registry:font" || !font.font.dependency) {
      throw new Error(
        `shadcn returned an unsupported font for preset ${code}.`
      );
    }
    fonts.push({
      variable: font.font.variable,
      family: font.font.family,
      dependency: font.font.dependency,
    });
  }
  if (!fonts.some((font) => font.variable === "--font-sans")) {
    throw new Error(`shadcn returned no body font for preset ${code}.`);
  }
  const dependencies: Record<string, string> = {};
  for (const spec of [
    ...(item.dependencies ?? []),
    ...fonts.map((font) => font.dependency),
  ]) {
    const index = spec.lastIndexOf("@");
    const name = index > 0 ? spec.slice(0, index) : spec;
    const version = index > 0 ? spec.slice(index + 1) : "latest";
    dependencies[name] =
      defaults.dependencies[name as keyof typeof defaults.dependencies] ??
      version;
  }
  return {
    config: item.config as ResolvedUIPreset["config"],
    light: item.cssVars.light,
    dark: item.cssVars.dark,
    fonts,
    dependencies,
  };
}
