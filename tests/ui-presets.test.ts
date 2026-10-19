import { expect, test } from "bun:test";

import { defaultUIPresets, normalizeUIPreset } from "../src/ui-presets.ts";

test("preset prompts accept raw codes and copied flags, including short codes", () => {
  for (const input of ["b0", "--preset b0", " --preset   b0 ", "--preset=b0"]) {
    expect(normalizeUIPreset(input, defaultUIPresets.public)).toBe("b0");
  }
  expect(normalizeUIPreset("--preset bImMZYe", defaultUIPresets.admin)).toBe(
    "bImMZYe"
  );
  expect(normalizeUIPreset("  ", defaultUIPresets.public)).toBe(
    defaultUIPresets.public
  );
  expect(normalizeUIPreset("", defaultUIPresets.admin)).toBe(
    defaultUIPresets.admin
  );
});

test("invalid preset input is rejected before starting creation", () => {
  for (const input of [
    "foo",
    "--preset",
    "--preset b0 --force",
    "bunx shadcn init --preset b0",
    "https://example.com",
    "b0; echo test",
  ]) {
    expect(() => normalizeUIPreset(input, defaultUIPresets.admin)).toThrow(
      "valid shadcn preset"
    );
  }
});
