import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import { prepareAuthStarter } from "../src/auth.ts";
import { createNextProject, runCreateNextApp } from "../src/create.ts";
import { prepareDatabaseStarter } from "../src/database.ts";
import { runCommand } from "../src/process.ts";
import {
  prepareStarter,
  configureProject,
  checkStarter,
  checkPackageManager,
} from "../src/setup.ts";
import { prepareTRPCStarter } from "../src/trpc.ts";
import {
  prepareUIStarter,
  addUIComponents,
  defaultAdminBlocks,
} from "../src/ui.ts";
import {
  markPlayground,
  playgroundDirectory,
  repository,
  syncPlayground,
} from "./playground/sync.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--setup")) {
  throw new Error("Usage: bun run playground [--setup]");
}
const require = createRequire(import.meta.url);
let exists = true;
try {
  await access(playgroundDirectory);
} catch {
  exists = false;
}
if (!exists) {
  console.log(
    "Preparing the persistent default Dinvolt playground (first run only)..."
  );
  await mkdir(join(repository, "demos"), { recursive: true });
  await runCommand(process.execPath, ["run", "build"], { cwd: repository });
  const managerVersion = await checkPackageManager("bun");
  await createNextProject(
    join(repository, "demos"),
    "dinvolt-playground",
    "new",
    async (directory) => {
      await runCreateNextApp(directory, "bun", true);
      await prepareStarter(directory);
      await prepareUIStarter(directory);
      await prepareDatabaseStarter(directory, "turso");
      await prepareAuthStarter(directory, "turso");
      await prepareTRPCStarter(directory);
      await configureProject(
        directory,
        {
          packageManager: "bun",
          linter: "oxlint",
          editors: ["universal"],
          database: "turso",
          skills: false,
        },
        managerVersion
      );
      await addUIComponents(directory, ["button"], { target: "public" });
      for (const block of defaultAdminBlocks) {
        await addUIComponents(directory, [block], { target: "admin" });
      }
      await checkStarter(directory);
      await markPlayground(directory);
    }
  );
}
await syncPlayground();
if (args.includes("--setup")) {
  console.log(`Playground ready at ${playgroundDirectory}`);
  process.exit(0);
}

const origin = "http://localhost:3100";
// Preview scenarios never load the internal Turso credentials automatically.
// Real end-to-end tests use a separate generated demo and explicit verification.
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next", { paths: [playgroundDirectory] }),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    cwd: playgroundDirectory,
    stdio: "inherit",
    env: { ...process.env, BETTER_AUTH_URL: origin },
  }
);
console.log(
  `\nDinvolt playground: ${origin}/playground\nEdit catalog/next/, catalog/registry/ or catalog/ui/; previews update automatically.\n`
);

let requested = false;
let running = false;
let timer: ReturnType<typeof setTimeout>;
const synchronize = async () => {
  requested = true;
  if (running) {
    return;
  }
  running = true;
  try {
    while (requested) {
      requested = false;
      await syncPlayground();
      console.log("Playground synchronized.");
    }
  } catch (error) {
    console.error(
      "Playground synchronization failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  } finally {
    running = false;
  }
};
const watchers = [
  "assets",
  "catalog/auth",
  "catalog/next",
  "catalog/registry",
  "catalog/ui",
  "playground",
].map((path) =>
  watch(join(repository, path), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void synchronize();
    }, 180);
  })
);
const close = () => {
  clearTimeout(timer);
  for (const watcher of watchers) {
    watcher.close();
  }
  child.kill("SIGTERM");
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
child.once("error", (error) => {
  console.error(error.message);
  close();
  process.exitCode = 1;
});
child.once("exit", (code) => {
  close();
  process.exitCode = code ?? 0;
});
