import { parse } from "postcss";
import type { Rule } from "postcss";

import type { ResolvedUIPreset } from "./ui-presets.ts";
import type { UITarget } from "./ui.ts";

export function applyUIPreset(
  css: string,
  target: UITarget,
  preset: ResolvedUIPreset
) {
  const root = parse(css);
  for (const font of preset.fonts) {
    const params = JSON.stringify(font.dependency);
    if (
      !root.nodes.some(
        (node) =>
          node.type === "atrule" &&
          node.name === "import" &&
          node.params === params
      )
    ) {
      root.prepend({ name: "import", params });
    }
  }
  root.walkRules((rule) => {
    const kind = themeRule(rule);
    if (!kind?.startsWith(target)) {
      return;
    }
    const light = kind.endsWith("light");
    rule.removeAll();
    if (light) {
      for (const font of preset.fonts) {
        rule.append({
          prop:
            font.variable === "--font-heading" ? "--font-title" : "--font-body",
          value: font.family,
        });
      }
      if (!preset.fonts.some((font) => font.variable === "--font-heading")) {
        rule.append({ prop: "--font-title", value: "var(--font-body)" });
      }
    }
    for (const [name, value] of Object.entries(
      light ? preset.light : preset.dark
    )) {
      rule.append({ prop: name.startsWith("--") ? name : `--${name}`, value });
    }
  });
  return root.toString();
}

function themeRule(rule: Rule) {
  if (rule.parent?.type !== "root") {
    return;
  }
  const { selectors } = rule;
  if (selectors.length === 1) {
    if (selectors[0] === ":root") {
      return "public-light";
    }
    if (selectors[0] === ".dark") {
      return "public-dark";
    }
    if (selectors[0] === ".admin-panel") {
      return "admin-light";
    }
  }
  if (
    selectors.length === 2 &&
    selectors.includes(".dark .admin-panel") &&
    selectors.includes(".admin-panel.dark")
  ) {
    return "admin-dark";
  }
}

// The upstream CLI edits :root/.dark. Give it only the selected area's tokens
// in a temporary stylesheet, keeping globals.css as the source of truth.
export function extractUITheme(css: string, target: UITarget) {
  const root = parse(css);
  let found = false;
  root.walkRules((rule) => {
    const kind = themeRule(rule);
    if (!kind) {
      return;
    }
    if (!kind.startsWith(target)) {
      rule.remove();
      return;
    }
    found = true;
    rule.selector = kind.endsWith("light") ? ":root" : ".dark";
  });
  if (!found) {
    throw new Error(`The shared globals.css has no ${target} theme variables.`);
  }
  return root.toString();
}

export function mergeUITheme(css: string, updated: string, target: UITarget) {
  if (updated === extractUITheme(css, target)) {
    return css;
  }
  const original = parse(css);
  const result = parse(updated);
  const themes = new Map<string, Rule[]>();
  const collect = (kind: string, rule: Rule) =>
    themes.set(kind, [...(themes.get(kind) ?? []), rule.clone()]);
  original.walkRules((rule) => {
    const kind = themeRule(rule);
    if (kind && !kind.startsWith(target)) {
      collect(kind, rule);
    }
  });
  result.walkRules((rule) => {
    const kind = themeRule(rule);
    if (!kind) {
      return;
    }
    if (kind.startsWith("public")) {
      const mode = kind.endsWith("light") ? "light" : "dark";
      const copy = rule.clone();
      copy.selector =
        target === "public"
          ? mode === "light"
            ? ":root"
            : ".dark"
          : mode === "light"
            ? ".admin-panel"
            : ".dark .admin-panel, .admin-panel.dark";
      collect(`${target}-${mode}`, copy);
    }
    rule.remove();
  });
  for (const key of [
    "public-light",
    "public-dark",
    "admin-light",
    "admin-dark",
  ]) {
    for (const rule of themes.get(key) ?? []) {
      result.append(rule);
    }
  }
  return result.toString();
}
