import { expect, spyOn, test } from "bun:test";

import { authLogger } from "../catalog/auth/auth-logger.ts";

test("auth diagnostics retain severity without provider messages or query parameters", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    const sensitive = "fixture-session-token-must-not-be-logged";
    authLogger.log("error", `Failed query ${sensitive}`, new Error(sensitive), {
      params: [sensitive],
    });
    authLogger.log("warn", sensitive, { credentials: sensitive });
    expect(error.mock.calls).toEqual([
      ["[auth] Authentication service error."],
    ]);
    expect(warn.mock.calls).toEqual([["[auth] Authentication warning."]]);
    expect(
      JSON.stringify([...error.mock.calls, ...warn.mock.calls])
    ).not.toContain(sensitive);
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
});
