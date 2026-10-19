import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--dry-run", "--ignore-scripts", "--json"],
  { cwd: root, encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 }
);
const packages = JSON.parse(output) as { files: { path: string }[] }[];
assert.equal(packages.length, 1, "Expected one package.");
const [packed] = packages;
assert.ok(packed, "Missing package file list.");
const paths = new Set(packed.files.map(({ path }) => path));
const rootFiles = new Set([
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "docs/cli.md",
  "docs/vercel.md",
]);

for (const path of paths) {
  assert.ok(
    rootFiles.has(path) ||
      path.startsWith("catalog/") ||
      path.startsWith("dist/"),
    `Unexpected package entry: ${path}`
  );
  assert.ok(
    !path
      .split("/")
      .some(
        (part) =>
          part === "AGENTS.md" ||
          part === "node_modules" ||
          part === ".git" ||
          (part.startsWith(".env") && part !== ".env.example")
      ),
    `Private or internal package entry: ${path}`
  );
}

for (const required of [
  ...rootFiles,
  "dist/cli.js",
  "dist/registry/admin-panel.json",
  "dist/registry/public-actions.json",
  "catalog/next/README.md",
  "catalog/registry/LICENSE.shadcn",
  "catalog/ui/components/LICENSE.shadcn",
  "catalog/ui/components/icons/LICENSE.nucleo",
  "catalog/ui/og/Inter-OFL.txt",
]) {
  assert.ok(paths.has(required), `Missing required package entry: ${required}`);
}

console.log(`Package contents verified (${paths.size} files).`);
