/* eslint-disable unicorn/no-top-level-side-effects -- This file is a CLI entry point. */
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(
  new URL("index.mjs", import.meta.resolve("auth/api"))
);
const cliArgumentOffset = 2;
const [command, ...cliArguments] = process.argv.slice(cliArgumentOffset);
const result = spawnSync(
  process.execPath,
  [...process.execArgv, cli, command, ...cliArguments],
  { stdio: "inherit" }
);
if (result.error) {
  throw result.error;
}
const successExitCode = 0;
if (result.status !== successExitCode) {
  const failureExitCode = 1;
  process.exit(result.status ?? failureExitCode);
}

if (command === "generate") {
  const config = JSON.parse(await readFile(".dinvolt/config.json", "utf-8"));
  const path = "src/db/auth-schema.ts";
  const generated = await readFile(path, "utf-8");
  let source = generated.replaceAll("/* @__PURE__ */ ", "");
  if (config.database.provider === "turso") {
    // The upstream generator uses the legacy relations API, retained under this path in Drizzle v1.
    source = source.replace(
      /import \{ (?<imports>[^}]+) \} from "drizzle-orm";/u,
      (statement, imports) => {
        const names = imports.split(", ");
        if (!names.includes("relations")) {
          return statement;
        }
        const remaining = names.filter((name) => name !== "relations");
        const original = remaining.length
          ? `import { ${remaining.join(", ")} } from "drizzle-orm";\n`
          : "";
        return `${original}import { relations } from "drizzle-orm/_relations";`;
      }
    );
  }
  const header =
    "/* eslint-disable sort-keys -- Keep the official Better Auth generator's column order. */\n";
  await writeFile(path, `${header}${source}`);
}
