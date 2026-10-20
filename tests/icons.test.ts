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

async function iconVersion(changedFile?: string) {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-icon-cache-"));
  directories.push(directory);
  await mkdir(join(directory, "src/components"), { recursive: true });
  await mkdir(join(directory, "src/lib"), { recursive: true });
  for (const [source, target] of [
    ["../catalog/next/next.config.ts", "next.config.ts"],
    ["../catalog/ui/components/logo-iso.tsx", "src/components/logo-iso.tsx"],
    ["../catalog/next/icon-image.tsx", "src/lib/icon-image.tsx"],
  ] as const) {
    await cp(new URL(source, import.meta.url), join(directory, target));
  }
  if (changedFile) {
    await writeFile(join(directory, changedFile), "// Changed icon source\n", {
      flag: "a",
    });
  }
  const { default: config } = await import(
    pathToFileURL(join(directory, "next.config.ts")).href
  );
  return config.env.DINVOLT_ICON_VERSION as string;
}

test("identical icon sources keep the same cache version across builds", async () => {
  const version = await iconVersion();
  expect(version).toMatch(/^[a-f0-9]{16}$/u);
  expect(await iconVersion()).toBe(version);
});

test.each(["src/components/logo-iso.tsx", "src/lib/icon-image.tsx"])(
  "changing %s invalidates immutable icon URLs",
  async (file) => {
    expect(await iconVersion(file)).not.toBe(await iconVersion());
  }
);
