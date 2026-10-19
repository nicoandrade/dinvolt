import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

interface Release {
  tag_name: string;
  prerelease: boolean;
}

export function releaseMetadata(
  release: Release,
  manifest: { name: string; version: string },
  changelog: string
) {
  assert.equal(manifest.name, "dinvolt", "Unexpected npm package name.");
  assert.match(
    manifest.version,
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/u,
    "Expected a release version without build metadata."
  );
  assert.equal(
    release.tag_name,
    `v${manifest.version}`,
    "The release tag must match package.json (v<version>)."
  );
  assert.equal(
    release.prerelease,
    manifest.version.includes("-"),
    "The GitHub prerelease flag must match the package version."
  );
  assert.ok(
    changelog
      .split("\n")
      .some(
        (line) =>
          line.startsWith(`## ${manifest.version} - `) &&
          /^\d{4}-\d{2}-\d{2}$/u.test(
            line.slice(`## ${manifest.version} - `.length)
          )
      ),
    "Add a dated CHANGELOG.md entry for this version before publishing."
  );
  return {
    version: manifest.version,
    npmTag: release.prerelease ? "next" : "latest",
  };
}

interface Archive {
  filename: string;
  version: string;
  integrity: string;
}

export function verifyRegistryArchive(
  archive: Archive,
  published: {
    version: string;
    dist: { integrity: string };
  }
) {
  assert.equal(published.version, archive.version, "Registry version differs.");
  assert.equal(
    published.dist.integrity,
    archive.integrity,
    "Registry archive differs from the tested archive."
  );
}

export function isRegistryPropagationError(error: unknown) {
  return (
    error instanceof Error &&
    "stderr" in error &&
    typeof error.stderr === "string" &&
    /npm error code E(?:TARGET|404)\b/u.test(error.stderr)
  );
}

async function metadata() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  assert.ok(eventPath, "GITHUB_EVENT_PATH is required.");
  const event = JSON.parse(await readFile(eventPath, "utf-8"));
  assert.equal(
    event.action,
    "published",
    "Only published releases may publish to npm."
  );
  assert.equal(event.repository.full_name, "nicoandrade/dinvolt");
  assert.equal(event.release.draft, false, "Draft releases cannot publish.");
  return releaseMetadata(
    event.release,
    JSON.parse(await readFile("package.json", "utf-8")),
    await readFile("CHANGELOG.md", "utf-8")
  );
}

async function output(key: string, value: string) {
  assert.ok(process.env.GITHUB_OUTPUT, "GITHUB_OUTPUT is required.");
  await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function smoke(packageSpec: string, version: string, create: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-release-smoke-"));
  const args = [
    "exec",
    "--yes",
    "--prefer-online",
    "--registry=https://registry.npmjs.org/",
    "--package",
    packageSpec,
    "--",
    "dinvolt",
  ];
  try {
    const actual = execFileSync("npm", [...args, "--version"], {
      cwd: directory,
      encoding: "utf-8",
    });
    assert.equal(actual.trim(), version, "Installed CLI version differs.");
    if (create) {
      execFileSync(
        "npm",
        [
          ...args,
          "create",
          "--name",
          "release-smoke",
          "--location",
          "new",
          "--project-type",
          "public",
          "--package-manager",
          "npm",
          "--no-skills",
          "--json",
        ],
        { cwd: directory, stdio: "inherit" }
      );
    } else {
      execFileSync("npm", [...args, "create", "--help"], {
        cwd: directory,
        stdio: "inherit",
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(command: string | undefined) {
  const release = await metadata();
  if (command === "validate") {
    await output("version", release.version);
    await output("npm-tag", release.npmTag);
    return;
  }
  assert.ok(process.env.RELEASE_DIRECTORY, "RELEASE_DIRECTORY is required.");
  const directory = resolve(process.env.RELEASE_DIRECTORY);
  const record = join(directory, "archive.json");
  if (command === "pack") {
    await mkdir(directory, { recursive: true });
    // bun run check has already built and checked the distribution.
    const [archive] = JSON.parse(
      execFileSync(
        "npm",
        ["pack", "--ignore-scripts", "--json", "--pack-destination", directory],
        { encoding: "utf-8" }
      )
    ) as Archive[];
    assert.ok(archive, "Missing npm archive.");
    assert.equal(archive.version, release.version);
    const path = join(directory, archive.filename);
    await smoke(path, release.version, true);
    await writeFile(record, `${JSON.stringify(archive)}\n`);
    await output("archive", path);
    return;
  }
  assert.equal(command, "verify", "Expected validate, pack or verify.");
  const archive = JSON.parse(await readFile(record, "utf-8")) as Archive;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const response = await fetch(
      `https://registry.npmjs.org/dinvolt/${release.version}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (response.ok) {
      verifyRegistryArchive(archive, await response.json());
      const tagsResponse = await fetch(
        "https://registry.npmjs.org/-/package/dinvolt/dist-tags",
        { signal: AbortSignal.timeout(15_000) }
      );
      assert.ok(tagsResponse.ok, "Could not verify npm dist-tags.");
      const tags = (await tagsResponse.json()) as Record<string, string>;
      if (tags[release.npmTag] !== release.version) {
        await setTimeout(10_000);
        continue;
      }
      try {
        await smoke(`dinvolt@${release.version}`, release.version, false);
      } catch (error) {
        if (!isRegistryPropagationError(error)) {
          throw error;
        }
        console.log(
          "npm metadata is still propagating; retrying the installed CLI check."
        );
        await setTimeout(10_000);
        continue;
      }
      console.log(
        `Verified dinvolt@${release.version} and its published archive.`
      );
      return;
    }
    assert.equal(
      response.status,
      404,
      `Registry verification failed: HTTP ${response.status}`
    );
    await setTimeout(10_000);
  }
  throw new Error(
    "npm accepted the upload but the version is not available yet. Check the registry before retrying publication."
  );
}

if (import.meta.main) {
  await main(process.argv[2]);
}
