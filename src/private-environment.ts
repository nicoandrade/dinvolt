import { execFile } from "node:child_process";
import { mkdtemp, open, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";

import type { DatabaseEnvironment } from "./database.ts";
import { readOrdinaryFile } from "./files.ts";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

// Use the application's actual Next dotenv parser/expansion and precedence in
// an isolated process. Never mutate the CLI's environment or print file errors.
export async function effectiveEnvironment(
  root: string,
  environment: DatabaseEnvironment,
  keys: readonly string[],
  override?: { file: string; variables: ReadonlyMap<string, string> }
) {
  const files = [
    environment === "development"
      ? ".env.development.local"
      : ".env.production.local",
    ".env.local",
    environment === "development" ? ".env.development" : ".env.production",
    ".env",
  ];
  const loaded: {
    path: string;
    contents: string;
    env: Record<string, string>;
  }[] = [];
  for (const name of files) {
    let content = await readOrdinaryFile(root, name);
    if (override?.file === name) {
      content = mergeEnvironment(content ?? "", override.variables);
    }
    if (content !== null) {
      loaded.push({ path: name, contents: content, env: {} });
    }
  }
  const code = `const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync(0,'utf8')); delete process.env.__NEXT_PROCESSED_ENV; const {processEnv}=require(process.argv[1]); const [combined]=processEnv(data.files, data.root, {info(){},error(){}}, true); process.stdout.write(JSON.stringify(Object.fromEntries(data.keys.map(k=>[k,combined[k]]))));`;
  // execFile has no stdin option. A private stdin protocol avoids credentials in argv.
  const { spawn } = await import("node:child_process");
  // eslint-disable-next-line promise/avoid-new -- Capture a private subprocess protocol; discard parser diagnostics.
  return new Promise<Record<string, string | undefined>>((resolve, reject) => {
    const child = spawn(
      process.versions.bun ? "node" : process.execPath,
      ["-e", code, require.resolve("@next/env")],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV:
            environment === "development" ? "development" : "production",
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    let output = "";
    const timer = setTimeout(() => child.kill(), 10_000);
    child.stdout.on("data", (chunk) => {
      if (output.length < 1_000_000) {
        output += String(chunk);
      }
    });
    child.stderr.resume();
    child.stdin.on("error", () => {
      /* close handles failure */
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not inspect the effective Next.js environment."));
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      try {
        if (status !== 0) {
          throw new Error(
            "Private environment inspection or persistence failed."
          );
        }
        resolve(JSON.parse(output));
      } catch {
        reject(
          new Error(
            "Could not inspect the effective Next.js environment. No credentials were displayed."
          )
        );
      }
    });
    child.stdin.end(JSON.stringify({ files: loaded, root, keys }));
  });
}

export async function trackedEnvironment(root: string, file: string) {
  try {
    const { stdout } = await execute("git", ["ls-files", "--", file], {
      cwd: root,
    });
    return Boolean(stdout.trim());
  } catch (error) {
    if ((error as { code?: unknown }).code === 128) {
      return false;
    }
    throw new Error(
      "Git could not verify whether the dotenv file is tracked. Restore Git access before saving secrets.",
      { cause: error }
    );
  }
}

export async function environmentDestination(root: string) {
  if ((await readOrdinaryFile(root, ".env.local")) !== null) {
    return ".env.local";
  }
  return (await readOrdinaryFile(root, ".env")) === null
    ? ".env.local"
    : ".env";
}

const assignment =
  /^(?:export[\t ]+)?(?<name>[\w]+)[\t ]*=[\t ]*(?:'[^']*'|"(?:\\.|[^"\\])*"|`[^`]*`|[^#\r\n]*)[\t ]*(?<comment>#[^\r\n]*)?(?<ending>\r?)$/gmu;
export function mergeEnvironment(
  original: string,
  variables: ReadonlyMap<string, string>
) {
  const remaining = new Map(variables);
  const seen = new Set<string>();
  const merged = original.replace(
    assignment,
    (
      line,
      name: string,
      comment: string | undefined,
      ending: string | undefined
    ) => {
      if (!variables.has(name)) {
        return line;
      }
      remaining.delete(name);
      if (seen.has(name)) {
        return `${comment ?? ""}${ending ?? ""}`;
      }
      seen.add(name);
      return `${name}=${variables.get(name)}${comment ? ` ${comment.trimStart()}` : ""}${ending ?? ""}`;
    }
  );
  return remaining.size
    ? `${merged.trimEnd()}\n\n${[...remaining].map(([name, value]) => `${name}=${value}`).join("\n")}\n`
    : merged;
}

export async function writePrivateEnvironment(
  root: string,
  variables: ReadonlyMap<string, string>,
  file?: string
) {
  if (!variables.size) {
    return;
  }
  const destination = file ?? (await environmentDestination(root));
  if (
    ![
      ".env",
      ".env.local",
      ".env.development.local",
      ".env.production.local",
    ].includes(destination)
  ) {
    throw new Error("Unsupported private environment destination.");
  }
  const original = await readOrdinaryFile(root, destination);
  if (await trackedEnvironment(root, destination)) {
    throw new Error(
      `${destination} is tracked by Git. Choose an untracked private dotenv file before saving credentials.`
    );
  }
  const ignore = (await readOrdinaryFile(root, ".gitignore")) ?? "";
  // Last anchored rule wins over earlier negations. Validate with Git when available.
  const lines = ignore.split(/\r?\n/u);
  const rules = [
    ...(!lines.includes(`/${destination}`) && !lines.includes(destination)
      ? [`/${destination}`]
      : []),
    ...(lines.includes("/.dinvolt-env-*/") ? [] : ["/.dinvolt-env-*/"]),
  ];
  if (rules.length) {
    await writeFile(
      join(root, ".gitignore"),
      `${ignore.trimEnd()}\n${rules.join("\n")}\n`
    );
  }
  let repository = false;
  try {
    await execute("git", ["rev-parse", "--show-toplevel"], { cwd: root });
    repository = true;
  } catch {
    /* A future git init is protected by the rule above. */
  }
  if (repository) {
    try {
      await execute(
        "git",
        ["check-ignore", "--no-index", "--quiet", "--", destination],
        { cwd: root }
      );
    } catch {
      throw new Error(
        `Git does not exclude ${destination}. Credentials were not saved.`
      );
    }
  }
  const temporary = await mkdtemp(join(root, ".dinvolt-env-"));
  try {
    const path = join(temporary, "environment");
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(mergeEnvironment(original ?? "", variables));
    } finally {
      await handle.close();
    }
    // Recheck the destination and index immediately before replacing it.
    if (await trackedEnvironment(root, destination)) {
      throw new Error("Private environment inspection or persistence failed.");
    }
    if ((await readOrdinaryFile(root, destination)) !== original) {
      throw new Error("The dotenv file changed during setup.");
    }
    await rename(path, join(root, destination));
  } catch {
    throw new Error(
      `Could not save private credentials to ${destination}. Existing project files were preserved.`
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
