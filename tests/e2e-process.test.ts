import { expect, test } from "bun:test";

import { execute } from "../scripts/e2e/process.ts";

const options = {
  cwd: process.cwd(),
  env: process.env,
  label: "Private worker",
};

test("E2E subprocess failures do not expose stdout or provider diagnostics", async () => {
  const result = execute(
    "node",
    [
      "-e",
      'console.log("private-stdout"); console.error("private-provider-token"); process.exit(2);',
    ],
    options
  );
  const failure = await result.catch((error: Error) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain("Private worker failed");
  expect(String(failure)).not.toContain("private-stdout");
  expect(String(failure)).not.toContain("private-provider-token");
});

test("a timed out worker that handles termination with exit zero still fails", async () => {
  await expect(
    execute(
      "node",
      [
        "-e",
        'process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 1000);',
      ],
      { ...options, timeout: 200 }
    )
  ).rejects.toThrow("timed out");
});

test("an interrupted worker cannot report a successful run", async () => {
  await expect(
    execute(
      "node",
      [
        "-e",
        'process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 1000);',
      ],
      { ...options, signal: AbortSignal.timeout(200) }
    )
  ).rejects.toThrow("interrupted");
});
