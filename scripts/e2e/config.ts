import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export interface Credentials {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export async function testCredentials(file: string): Promise<Credentials> {
  let values: NodeJS.ProcessEnv;
  try {
    values = parseEnv(await readFile(file, "utf-8"));
  } catch {
    throw new Error("Local E2E requires the internal root .env.demo.local.");
  }
  const url = values.TURSO_DATABASE_URL?.trim();
  const token = values.TURSO_AUTH_TOKEN?.trim();
  if (!url || !token) {
    throw new Error(
      "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in root .env.demo.local."
    );
  }
  return { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token };
}

// Generation must not inherit credentials, deployment selectors or auth defaults.
// Explicit runtime values are injected afterward and win over all dotenv files.
export function localEnvironment(source: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        !/^(?:TURSO_|DATABASE_|BETTER_AUTH_|DEV_ADMIN_|VERCEL_|DINVOLT_DATABASE_ENV$|NODE_ENV$|NODE_OPTIONS$|NEXT_PUBLIC_|RESEND_|EMAIL_FROM$|__NEXT_PROCESSED_ENV$)/u.test(
          key
        )
    )
  );
}

export function verifyCredentials(
  effective: NodeJS.ProcessEnv,
  expected: Credentials
) {
  if (
    effective.DINVOLT_DATABASE_ENV !== "development" ||
    effective.TURSO_DATABASE_URL !== expected.TURSO_DATABASE_URL ||
    effective.TURSO_AUTH_TOKEN !== expected.TURSO_AUTH_TOKEN
  ) {
    throw new Error(
      "Effective database configuration differs from internal E2E credentials."
    );
  }
}

export function testIdentity(run: string) {
  if (!/^\d+-[a-f\d]{8}$/u.test(run)) {
    throw new Error("Invalid internal E2E run identifier.");
  }
  return {
    adminEmail: `dinvolt-e2e-${run}-admin@example.com`,
    userEmail: `dinvolt-e2e-${run}-user@example.com`,
    deniedEmail: `dinvolt-e2e-${run}-denied@example.com`,
  };
}
