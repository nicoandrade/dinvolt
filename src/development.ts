import { createHash } from "node:crypto";

export function developmentUrl(projectName: string) {
  // Match Portless's package-name normalization, including its DNS label limit.
  let name = projectName
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  if (!name) {
    throw new Error(
      "A project name is required for the local development URL."
    );
  }
  if (name.length > 63) {
    const hash = createHash("sha256").update(name).digest("hex").slice(0, 6);
    name = `${name.slice(0, 56).replace(/-+$/u, "")}-${hash}`;
  }
  return `https://${name}.localhost`;
}

export function checkDevelopmentRuntime(version = process.versions.node) {
  if (Number(version.split(".")[0]) < 24) {
    throw new Error(
      "Creating a Portless starter requires Node.js 24 or later. Upgrade Node.js and run dinvolt create again."
    );
  }
}
