import { join } from "node:path";

import type { Credentials } from "./config.ts";
import { execute } from "./process.ts";

export async function databaseWorker(
  repository: string,
  directory: string,
  env: NodeJS.ProcessEnv,
  credentials: Credentials,
  run: string,
  operation: string,
  signal?: AbortSignal
) {
  const raw = await execute(
    process.execPath,
    [join(repository, "scripts/e2e/worker.ts")],
    {
      cwd: directory,
      env,
      label: `Internal E2E ${operation}`,
      input: { operation, credentials, run },
      timeout: 120_000,
      signal,
    }
  );
  const response = JSON.parse(raw);
  if (!response.ok) {
    throw new Error(`Internal E2E ${operation} failed.`);
  }
  return response.result;
}
