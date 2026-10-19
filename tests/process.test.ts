import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { runCommand } from "../src/process.ts";

test("successful tools do not leak stdout or stderr into the wizard", () => {
  const source = new URL("../src/process.ts", import.meta.url).href;
  const result = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `
    import { runCommand } from ${JSON.stringify(source)};
    await runCommand(process.execPath, ["-e", 'console.log("Tool progress"); console.error("Tool summary");']);
    console.log("Wizard continues");
  `,
    ],
    { encoding: "utf-8", timeout: 10_000 }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("Wizard continues\n");
  expect(result.stderr).toBe("");
});

test("failed tools retain diagnostics from both output streams without terminal control codes", async () => {
  const promise = runCommand("node", [
    "-e",
    'console.log("Installation context"); console.error("\\x1b[31mDependency installation failed\\x1b[0m"); process.exitCode = 7;',
  ]);
  const result = await promise.catch((error: Error) => error);
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain("exit code 7");
  expect((result as Error).message).toContain("Installation context");
  expect((result as Error).message).toContain("Dependency installation failed");
  expect((result as Error).message).not.toContain("\u001B");
});

test("large failure logs keep their final diagnostic with bounded output", async () => {
  const result = await runCommand("node", [
    "-e",
    'console.log("x".repeat(100000)); console.error("Final failure details"); process.exitCode = 1;',
  ]).catch((error: Error) => error);
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message.length).toBeLessThan(66_000);
  expect((result as Error).message).toContain("Earlier output omitted.");
  expect((result as Error).message).toContain("Final failure details");
});
