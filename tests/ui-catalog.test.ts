import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  loadUIComponentCatalog,
  defaultSelectionComponents,
  resolveUIComponents,
} from "../src/ui-catalog.ts";

for (const area of ["admin", "public"] as const) {
  test(`${area} selectors remain local with custom presets without replacing upstream primitives`, async () => {
    const catalog = await loadUIComponentCatalog(area);
    for (const style of [catalog.style, "base-nova"]) {
      const result = await resolveUIComponents(area, style, [
        ...defaultSelectionComponents,
        "button",
      ]);
      expect(result?.unresolved).toEqual(
        style === catalog.style ? [] : ["button"]
      );
      for (const name of defaultSelectionComponents) {
        expect(
          result?.payload.files?.find((file) => file.path === `ui/${name}.tsx`)
            ?.content
        ).toBe(await readFile(join(catalog.root, `ui/${name}.tsx`), "utf-8"));
      }
      expect(result?.payload.dependencies).toContain("@base-ui/react@1.9.0");
      expect(result?.payload.cssVars).toBeUndefined();
      expect(result?.payload.css).toBeUndefined();
    }
  });

  test(`the ${area} catalog resolves every component and its local dependencies`, async () => {
    const catalog = await loadUIComponentCatalog(area);
    const names = catalog.items
      .filter((item) => item.type === "registry:ui")
      .map((item) => item.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    const result = await resolveUIComponents(area, catalog.style, names);
    expect(result?.unresolved).toEqual([]);
    expect(result?.names).toEqual(expect.arrayContaining(names));
    expect(result?.names).toContain("use-mobile");
    expect(
      result?.payload.files?.some((file) => file.path === "lib/highlighter.tsx")
    ).toBe(true);
    expect(new Set(result?.payload.files?.map((file) => file.path)).size).toBe(
      result!.payload.files!.length
    );
    for (const file of result!.payload.files!) {
      expect(file.content!.length).toBeGreaterThan(0);
    }
  });

  test(`${area} components read their editable sources, with only the requested dependency closure`, async () => {
    const catalog = await loadUIComponentCatalog(area);
    const result = await resolveUIComponents(area, catalog.style, ["dialog"]);
    expect(result?.names.toSorted()).toEqual(["button", "dialog"]);
    expect(
      result?.payload.files?.find((file) => file.path === "ui/button.tsx")
        ?.content
    ).toBe(await readFile(join(catalog.root, "ui/button.tsx"), "utf-8"));
    expect(
      await resolveUIComponents(area, "radix-nova", ["dialog"])
    ).toBeNull();
    expect(
      (
        await resolveUIComponents(area, catalog.style, [
          "button",
          "unknown-component",
        ])
      )?.unresolved
    ).toEqual(["unknown-component"]);
  });
}

test("both profiles install the same Dinvolt spinner source", async () => {
  const admin = await resolveUIComponents("admin", "base-vega", ["spinner"]);
  const original = await readFile(
    new URL("../catalog/registry/shared/spinner/spinner.tsx", import.meta.url),
    "utf-8"
  );
  expect(admin?.payload.files?.[0]?.content).toBe(original);
  const publicSpinner = await resolveUIComponents("public", "base-luma", [
    "spinner",
  ]);
  expect(publicSpinner?.payload.files?.[0]?.content).toBe(original);
});
