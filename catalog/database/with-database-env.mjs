/* eslint-disable unicorn/no-top-level-side-effects -- This file is a CLI entry point. */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageBinary = (name) => {
  for (const directory of require.resolve.paths(name) ?? []) {
    const manifestPath = path.join(directory, name, "package.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const bin =
      typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[name];
    if (bin) {
      return path.join(directory, name, bin);
    }
  }
  throw new Error(`Install ${name} before running this command.`);
};

const argumentOffset = 2;
const [environment, command, ...args] = process.argv.slice(argumentOffset);
if (
  !["development", "staging", "production"].includes(environment) ||
  !command
) {
  throw new Error(
    "Usage: node scripts/with-database-env.mjs <development|staging|production> <command> [arguments]"
  );
}
// Override inherited selectors, including Vercel preview/production. No shell interpolation.
const packageCommands = new Set(["drizzle-kit", "portless", "next"]);
const executable =
  command === "node" || packageCommands.has(command)
    ? process.execPath
    : command;
const commandArguments = packageCommands.has(command)
  ? [packageBinary(command), ...args]
  : args;
const child = spawn(executable, commandArguments, {
  env: { ...process.env, DINVOLT_DATABASE_ENV: environment },
  stdio: "inherit",
  shell: false,
});
child.on("error", () => {
  console.error(
    `Could not start ${command}. Check that dependencies are installed.`
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
