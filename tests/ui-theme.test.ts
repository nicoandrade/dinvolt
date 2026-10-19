import { expect, test } from "bun:test";

import { parse } from "postcss";

import { extractUITheme, mergeUITheme } from "../src/ui-theme.ts";

const css =
  '@import "tailwindcss";\n:root { --primary: blue; --radius: 1rem; }\n.dark { --primary: navy; }\n.admin-panel { --primary: black; --radius: 0.5rem; }\n.dark .admin-panel, .admin-panel.dark { --primary: white; }\n@theme inline { --color-primary: var(--primary); }\n';

function value(source: string, selector: string, property: string) {
  let result: string | undefined;
  parse(source).walkRules(selector, (rule) => {
    rule.walkDecls(property, (decl) => {
      result = decl.value;
    });
  });
  return result;
}

test("the official CLI sees only the selected area's light and dark tokens", () => {
  const admin = extractUITheme(css, "admin");
  expect(value(admin, ":root", "--primary")).toBe("black");
  expect(value(admin, ".dark", "--primary")).toBe("white");
  expect(admin).not.toContain(".admin-panel");
  expect(admin).not.toContain("blue");
  const publicTheme = extractUITheme(css, "public");
  expect(value(publicTheme, ":root", "--primary")).toBe("blue");
  expect(value(publicTheme, ".dark", "--primary")).toBe("navy");
  expect(publicTheme).not.toContain(".admin-panel");
});

test("admin registry CSS additions stay scoped without changing public values", () => {
  const input = extractUITheme(css, "admin");
  const updated = input
    .replace("--primary: black", "--primary: red; --chart-new: orange")
    .replace("--primary: white", "--primary: pink");
  const merged = mergeUITheme(css, updated, "admin");
  expect(value(merged, ":root", "--primary")).toBe("blue");
  expect(value(merged, ".dark", "--primary")).toBe("navy");
  expect(value(merged, ".admin-panel", "--primary")).toBe("red");
  expect(value(merged, ".admin-panel", "--chart-new")).toBe("orange");
  expect(value(merged, ":root", "--chart-new")).toBeUndefined();
  expect(
    value(merged, ".dark .admin-panel, .admin-panel.dark", "--primary")
  ).toBe("pink");
});

test("public registry CSS updates preserve both admin modes and common utilities", () => {
  const updated = `${extractUITheme(css, "public").replace("--primary: blue", "--primary: green")}\n@keyframes appear { to { opacity: 1; } }`;
  const merged = mergeUITheme(css, updated, "public");
  expect(value(merged, ":root", "--primary")).toBe("green");
  expect(value(merged, ".admin-panel", "--primary")).toBe("black");
  expect(
    value(merged, ".dark .admin-panel, .admin-panel.dark", "--primary")
  ).toBe("white");
  expect(merged).toContain("@keyframes appear");
});

test("a CLI operation with no CSS changes preserves globals.css byte for byte", () => {
  for (const target of ["admin", "public"] as const) {
    expect(mergeUITheme(css, extractUITheme(css, target), target)).toBe(css);
  }
});
