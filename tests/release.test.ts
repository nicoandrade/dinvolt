import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { releaseMetadata, verifyRegistryArchive } from "../scripts/release.ts";

const manifest = { name: "dinvolt", version: "0.1.1" };
const release = { tag_name: "v0.1.1", prerelease: false };
const changelog = "## Unreleased\n\n## 0.1.1 - 2026-10-20\n";

test("publication is triggered only by a published GitHub release", () => {
  const workflow = Bun.YAML.parse(
    readFileSync(
      new URL("../.github/workflows/publish.yml", import.meta.url),
      "utf-8"
    )
  ) as { on: unknown };
  expect(workflow.on).toEqual({ release: { types: ["published"] } });
});

test("release versions must match the tag and a dated changelog entry", () => {
  expect(releaseMetadata(release, manifest, changelog)).toEqual({
    version: "0.1.1",
    npmTag: "latest",
  });
  expect(() =>
    releaseMetadata({ ...release, tag_name: "v0.1.2" }, manifest, changelog)
  ).toThrow("tag");
  expect(() => releaseMetadata(release, manifest, "## Unreleased")).toThrow(
    "CHANGELOG"
  );
  expect(() =>
    releaseMetadata(release, { ...manifest, name: "other" }, changelog)
  ).toThrow("package name");
});

test("prereleases use next and cannot silently replace stable latest", () => {
  const prerelease = { tag_name: "v0.2.0-beta.1", prerelease: true };
  const version = { name: "dinvolt", version: "0.2.0-beta.1" };
  const notes = "## 0.2.0-beta.1 - 2026-10-20\n";
  expect(releaseMetadata(prerelease, version, notes).npmTag).toBe("next");
  expect(() =>
    releaseMetadata({ ...prerelease, prerelease: false }, version, notes)
  ).toThrow("prerelease");
  expect(() =>
    releaseMetadata({ ...release, prerelease: true }, manifest, changelog)
  ).toThrow("prerelease");
});

test("release verification rejects a different published artifact", () => {
  const archive = {
    filename: "dinvolt-0.1.1.tgz",
    version: "0.1.1",
    integrity: "sha512-tested",
  };
  expect(() =>
    verifyRegistryArchive(archive, {
      version: "0.1.1",
      dist: { integrity: "sha512-tested" },
    })
  ).not.toThrow();
  expect(() =>
    verifyRegistryArchive(archive, {
      version: "0.1.1",
      dist: { integrity: "sha512-other" },
    })
  ).toThrow("archive differs");
  expect(() =>
    verifyRegistryArchive(archive, {
      version: "0.1.0",
      dist: { integrity: "sha512-tested" },
    })
  ).toThrow("version differs");
});
