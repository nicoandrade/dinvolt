import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(
  new URL("../catalog/auth/dev-admin.ts", import.meta.url),
  "utf-8"
);
// Execute the actual server helper with an isolated env; no global process.env mutation.
const defaults = (env: Record<string, string | undefined>) => {
  const code = source
    .replace('import "server-only";', "")
    .replace('import { getDatabaseEnvironment } from "@/db/environment";', "")
    .replace(
      "export const developmentAdminDefaults",
      "const developmentAdminDefaults"
    );
  return runInNewContext(`${code}; developmentAdminDefaults();`, {
    process: { env },
    getDatabaseEnvironment: () => {
      if (env.DINVOLT_DATABASE_ENV === "invalid") {
        throw new Error("DB environment not configured");
      }
      return (
        env.DINVOLT_DATABASE_ENV ??
        (env.VERCEL_ENV === "preview"
          ? "staging"
          : env.VERCEL_ENV === "production"
            ? "production"
            : "development")
      );
    },
  });
};

test.each([
  { NODE_ENV: "production" },
  { NODE_ENV: "development", DINVOLT_DATABASE_ENV: "invalid" },
  { NODE_ENV: "development", DINVOLT_DATABASE_ENV: "staging" },
  { NODE_ENV: "development", DINVOLT_DATABASE_ENV: "production" },
  {
    NODE_ENV: "development",
    VERCEL_ENV: "preview",
    DINVOLT_DATABASE_ENV: "development",
  },
  {
    NODE_ENV: "development",
    VERCEL_ENV: "production",
    DINVOLT_DATABASE_ENV: "development",
  },
  { NODE_ENV: "development", VERCEL: "1", DINVOLT_DATABASE_ENV: "development" },
])("server filters accidental development credentials: %j", (env) => {
  expect(
    defaults({
      ...env,
      DEV_ADMIN_USER: "canary@example.com",
      DEV_ADMIN_PASSWORD: "canary-private",
    } as Record<string, string | undefined>)
  ).toEqual({ email: "", password: "" });
});

test("local development returns independent optional fields", () => {
  expect(defaults({ NODE_ENV: "development" })).toEqual({
    email: "",
    password: "",
  });
  expect(
    defaults({ NODE_ENV: "development", DEV_ADMIN_USER: "dev@example.com" })
  ).toEqual({ email: "dev@example.com", password: "" });
  expect(
    defaults({ NODE_ENV: "development", DEV_ADMIN_PASSWORD: "private" })
  ).toEqual({ email: "", password: "private" });
});
