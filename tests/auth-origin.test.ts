import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";

const originModule = new URL("../catalog/auth/auth-origin.ts", import.meta.url)
  .href;
function origin(env: Record<string, string>) {
  return execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `const {getAuthOrigin}=await import(${JSON.stringify(originModule)});try { console.log(getAuthOrigin()); } catch { console.log('INVALID'); }`,
    ],
    {
      encoding: "utf-8",
      env: {
        ...process.env,
        VERCEL_ENV: "",
        VERCEL_URL: "",
        BETTER_AUTH_URL: "",
        ...env,
      },
    }
  ).trim();
}
test("auth trusts only the exact Preview deployment and never falls back to production", () => {
  expect(
    origin({
      VERCEL_ENV: "preview",
      VERCEL_URL: "assigned-42.vercel.app",
      BETTER_AUTH_URL: "https://production.example.com",
    })
  ).toBe("https://assigned-42.vercel.app");
  for (const hostname of [
    "",
    "attacker.com/path",
    "attacker.com@trusted.vercel.app",
    "https://assigned.vercel.app",
    "assigned.vercel.app:443",
    "*.vercel.app",
  ]) {
    expect(
      origin({
        VERCEL_ENV: "preview",
        VERCEL_URL: hostname,
        BETTER_AUTH_URL: "https://production.example.com",
      })
    ).toBe("INVALID");
  }
  expect(
    origin({
      VERCEL_ENV: "production",
      BETTER_AUTH_URL: "https://actual-production.example.com",
    })
  ).toBe("https://actual-production.example.com");
  expect(
    origin({ VERCEL_ENV: "production", VERCEL_URL: "deployment.vercel.app" })
  ).toBe("INVALID");
  expect(origin({ BETTER_AUTH_URL: "https://local.localhost" })).toBe(
    "https://local.localhost"
  );
});
