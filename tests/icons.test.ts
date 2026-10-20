import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

async function imageVersions(changedFile?: string) {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-icon-cache-"));
  directories.push(directory);
  await mkdir(join(directory, "src/components"), { recursive: true });
  await mkdir(join(directory, "src/lib"), { recursive: true });
  await mkdir(join(directory, "assets/og"), { recursive: true });
  for (const [source, target] of [
    ["../catalog/next/next.config.ts", "next.config.ts"],
    ["../catalog/ui/components/logo-iso.tsx", "src/components/logo-iso.tsx"],
    ["../catalog/next/icon-image.tsx", "src/lib/icon-image.tsx"],
    ["../catalog/ui/og/image.tsx", "src/lib/og-image.tsx"],
    ["../catalog/ui/og/Inter-Bold.ttf", "assets/og/Inter-Bold.ttf"],
  ] as const) {
    await cp(new URL(source, import.meta.url), join(directory, target));
  }
  if (changedFile) {
    await writeFile(join(directory, changedFile), "// Changed image source\n", {
      flag: "a",
    });
  }
  const { default: config } = await import(
    pathToFileURL(join(directory, "next.config.ts")).href
  );
  return config.env as {
    DINVOLT_ICON_VERSION: string;
    DINVOLT_OG_VERSION: string;
  };
}

test("identical image sources keep the same cache versions across builds", async () => {
  const versions = await imageVersions();
  for (const version of Object.values(versions)) {
    expect(version).toMatch(/^[a-f0-9]{16}$/u);
  }
  expect(await imageVersions()).toEqual(versions);
});

test.each(["src/components/logo-iso.tsx", "src/lib/icon-image.tsx"])(
  "changing %s invalidates immutable icon URLs",
  async (file) => {
    expect((await imageVersions(file)).DINVOLT_ICON_VERSION).not.toBe(
      (await imageVersions()).DINVOLT_ICON_VERSION
    );
  }
);

test.each([
  "src/components/logo-iso.tsx",
  "src/lib/og-image.tsx",
  "assets/og/Inter-Bold.ttf",
])("changing %s invalidates immutable Open Graph URLs", async (file) => {
  const original = await imageVersions();
  const changed = await imageVersions(file);
  expect(changed.DINVOLT_OG_VERSION).not.toBe(original.DINVOLT_OG_VERSION);
  if (file !== "src/components/logo-iso.tsx") {
    expect(changed.DINVOLT_ICON_VERSION).toBe(original.DINVOLT_ICON_VERSION);
  }
});
