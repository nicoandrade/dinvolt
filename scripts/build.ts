import { chmod, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { runCommand } from "../src/process.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
await rm(`${root}/dist`, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [`${root}/src/cli.ts`],
  outdir: `${root}/dist`,
  target: "node",
  format: "esm",
  packages: "bundle",
});

if (result.success) {
  await chmod(`${root}/dist/cli.js`, 0o755);
  const require = createRequire(import.meta.url);
  await runCommand(
    process.execPath,
    [
      require.resolve("shadcn"),
      "build",
      "registry.json",
      "--output",
      `${root}/dist/registry`,
    ],
    { cwd: `${root}/catalog/registry` }
  );
  console.log("CLI built at dist/cli.js (Node.js).");
} else {
  for (const message of result.logs) {
    console.error(message);
  }
  process.exitCode = 1;
}
