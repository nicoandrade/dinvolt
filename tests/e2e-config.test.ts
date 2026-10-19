import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  localEnvironment,
  testCredentials,
  testIdentity,
  verifyCredentials,
} from "../scripts/e2e/config.ts";

test("E2E credentials come only from the internal file, parsed without executing shell", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-e2e-"));
  const file = join(directory, ".env.demo.local");
  try {
    await expect(testCredentials(file)).rejects.toThrow(".env.demo.local");
    await writeFile(
      file,
      'TURSO_DATABASE_URL="turso://test"\nUNRELATED=private\n'
    );
    await expect(testCredentials(file)).rejects.toThrow("TURSO_AUTH_TOKEN");
    await writeFile(
      file,
      "TURSO_DATABASE_URL=\"turso://test\"\nTURSO_AUTH_TOKEN='$(do-not-execute)'\nUNRELATED=private\n"
    );
    expect(await testCredentials(file)).toEqual({
      TURSO_DATABASE_URL: "turso://test",
      TURSO_AUTH_TOKEN: "$(do-not-execute)",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("E2E strips inherited deployment and database values before injecting verified credentials", () => {
  const safe = localEnvironment({
    PATH: "/bin",
    TURSO_DATABASE_URL: "wrong",
    TURSO_AUTH_TOKEN_PRODUCTION: "wrong",
    DATABASE_URL: "wrong",
    VERCEL_ENV: "production",
    DINVOLT_DATABASE_ENV: "production",
    BETTER_AUTH_SECRET: "wrong",
    NODE_ENV: "test",
    NODE_OPTIONS: "--require=other",
    RESEND_API_KEY: "wrong",
    __NEXT_PROCESSED_ENV: "true",
  });
  expect(safe).toEqual({ PATH: "/bin" });
  const credentials = {
    TURSO_DATABASE_URL: "turso://test",
    TURSO_AUTH_TOKEN: "test-token",
  };
  expect(() =>
    verifyCredentials(
      { ...safe, ...credentials, DINVOLT_DATABASE_ENV: "development" },
      credentials
    )
  ).not.toThrow();
  expect(() =>
    verifyCredentials(
      { ...credentials, DINVOLT_DATABASE_ENV: "production" },
      credentials
    )
  ).toThrow("differs");
  expect(() =>
    verifyCredentials(
      {
        ...credentials,
        DINVOLT_DATABASE_ENV: "development",
        TURSO_DATABASE_URL: "other",
      },
      credentials
    )
  ).toThrow("differs");
});

test("cleanup identities are exact run-owned emails, including denied mutation attempts", () => {
  const identity = testIdentity("1234567890-deadbeef");
  expect(new Set(Object.values(identity)).size).toBe(3);
  expect(identity.adminEmail).toBe(
    "dinvolt-e2e-1234567890-deadbeef-admin@example.com"
  );
  expect(() => testIdentity("%")).toThrow("Invalid");
  expect(() => testIdentity("arbitrary-user@example.com")).toThrow("Invalid");
});
