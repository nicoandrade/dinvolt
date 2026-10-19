import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { ExistingProject } from "./project-configuration.ts";

// Format planned edits through the already-installed formatter and its current
// configuration. Stdin mode never writes files or runs a customized npm script.
export async function formatProjectEdits(
  project: ExistingProject,
  edits: Map<string, string>
) {
  const standards = project.metadata.ultracite as
    | { linter?: string }
    | undefined;
  const linter = standards?.linter;
  if (!linter) {
    return;
  }
  const packageName =
    linter === "oxlint"
      ? "oxfmt"
      : linter === "biome"
        ? "@biomejs/biome"
        : linter === "eslint"
          ? "prettier"
          : undefined;
  if (!packageName) {
    throw new Error(
      "Unknown project formatter. Restore the recorded linter before adding environments."
    );
  }
  let binary: string;
  try {
    const manifestPath = createRequire(
      join(project.root, "package.json")
    ).resolve(`${packageName}/package.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    const name = linter === "biome" ? "biome" : packageName;
    const entry =
      typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[name];
    if (!entry) {
      throw new Error("Formatter binary missing.");
    }
    binary = join(dirname(manifestPath), entry);
  } catch {
    throw new Error(
      "Install this project's formatter dependencies before adding environments. No project files were changed."
    );
  }
  for (const [name, content] of edits) {
    if (
      name === ".env.example" ||
      (linter === "biome" && name.endsWith(".md"))
    ) {
      continue;
    }
    const args =
      linter === "biome"
        ? ["format", "--stdin-file-path", name]
        : ["--stdin-filepath", name];
    // eslint-disable-next-line promise/avoid-new -- Keep formatter stdout private and never expose configuration/parse errors containing file contents.
    const formatted = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.versions.bun ? "node" : process.execPath,
        [binary, ...args],
        { cwd: project.root, stdio: ["pipe", "pipe", "pipe"] }
      );
      let output = "";
      const timer = setTimeout(() => child.kill(), 20_000);
      const fail = () => {
        clearTimeout(timer);
        reject(
          new Error(
            `Could not format ${name} with the project's existing formatter. Check its configuration; no project files were changed.`
          )
        );
      };
      child.stdout.on("data", (chunk) => {
        if (output.length < 10_000_000) {
          output += String(chunk);
        } else {
          child.kill();
        }
      });
      child.stderr.resume();
      child.stdin.on("error", () => {
        /* close returns a safe failure */
      });
      child.on("error", fail);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && output) {
          resolve(output);
        } else {
          fail();
        }
      });
      child.stdin.end(content);
    });
    edits.set(name, formatted);
  }
}
