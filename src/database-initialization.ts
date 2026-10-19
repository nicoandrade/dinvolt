import { spawn } from "node:child_process";

import type { DatabaseConnection } from "./database-connections.ts";
import { runCommand } from "./process.ts";

export interface DatabaseInitialization {
  environment: DatabaseConnection["environment"];
  connected: boolean;
  status:
    | "review-required"
    | "credentials-pending"
    | "initialized"
    | "ready"
    | "incompatible"
    | "failed"
    | "application-pending"
    | "interrupted";
}

// Run before saving user credentials and before any remote mutations. Generation
// is local, once for the whole project, regardless of selected environments.
export async function generateInitialMigration(directory: string) {
  await runCommand(
    process.execPath,
    [
      "scripts/with-database-env.mjs",
      "development",
      "drizzle-kit",
      "generate",
      "--name=dinvolt_initial",
    ],
    { cwd: directory }
  );
}

// Capture metadata using the final formatted worker, whose object ordering can
// be changed by the project's selected code standards.
export async function prepareInitialDatabase(directory: string) {
  await runCommand(
    process.execPath,
    ["scripts/initialize-database.mjs", "--prepare"],
    { cwd: directory }
  );
}

export function initializeDatabaseConnection(
  directory: string,
  connection: DatabaseConnection
): Promise<DatabaseInitialization> {
  // eslint-disable-next-line promise/avoid-new -- Adapt subprocess events and the private stdin protocol to a safe result.
  return new Promise((resolve) => {
    const failed: DatabaseInitialization = {
      environment: connection.environment,
      connected: false,
      status: "failed",
    };
    const child = spawn(
      process.execPath,
      ["scripts/initialize-database.mjs", "--wizard"],
      { cwd: directory, stdio: ["pipe", "pipe", "pipe"], shell: false }
    );
    let output = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 120_000);
    const interrupt = () => child.kill("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    const cleanup = () => {
      clearTimeout(timeout);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    };
    child.stdout.on("data", (chunk) => {
      if (output.length < 4096) {
        output += String(chunk);
      }
    });
    // Discard diagnostics: credentials are private and drivers can echo them.
    child.stderr.resume();
    child.stdin.on("error", () => {
      /* The close event reports failed input safely. */
    });
    child.on("error", () => {
      cleanup();
      resolve(failed);
    });
    child.on("close", (code) => {
      cleanup();
      try {
        const result = JSON.parse(output);
        if (
          code !== 0 ||
          typeof result.connected !== "boolean" ||
          ![
            "initialized",
            "ready",
            "incompatible",
            "failed",
            "application-pending",
            "review-required",
          ].includes(result.status)
        ) {
          resolve(failed);
          return;
        }
        resolve({
          environment: connection.environment,
          connected: result.connected,
          status: result.status,
        });
      } catch {
        resolve(failed);
      }
    });
    // No credentials in argv, inherited env or package-manager output. The
    // generated worker receives only this environment's explicitly entered keys.
    child.stdin.end(JSON.stringify(connection));
  });
}

export async function initializeDatabaseConnections(
  directory: string,
  connections: readonly DatabaseConnection[],
  initialize = initializeDatabaseConnection
) {
  const results: DatabaseInitialization[] = [];
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    process.exitCode = 130;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    for (const connection of connections) {
      if (!connection.credentials || interrupted) {
        results.push({
          environment: connection.environment,
          connected: false,
          status: interrupted ? "interrupted" : "credentials-pending",
        });
        continue;
      }
      try {
        results.push(await initialize(directory, connection));
      } catch {
        results.push({
          environment: connection.environment,
          connected: false,
          status: "failed",
        });
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
  return results;
}
