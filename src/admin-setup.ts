import { spawn } from "node:child_process";

import {
  savePrivateEnvironment,
  serializeCredential,
} from "./database-connections.ts";
import type { DatabaseConnection } from "./database-connections.ts";
import type { DatabaseInitialization } from "./database-initialization.ts";
import type { DatabaseEnvironment } from "./database.ts";

export type AdminResult =
  | { status: "existing" | "available" | "failed" }
  | { status: "created"; email: string; password: string };
export type AdminWorker = (
  directory: string,
  connection: DatabaseConnection,
  identity?: { name: string; email: string }
) => Promise<AdminResult>;

export const runAdminWorker: AdminWorker = (directory, connection, identity) =>
  // eslint-disable-next-line promise/avoid-new -- Adapt private subprocess events without logging credentials.
  new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/wizard-admin.mjs"], {
      cwd: directory,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let output = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 60_000);
    const interrupt = () => child.kill("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    const finish = (result: AdminResult) => {
      clearTimeout(timeout);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
      resolve(result);
    };
    child.stdout.on("data", (chunk) => {
      if (output.length < 4096) {
        output += String(chunk);
      }
    });
    child.stderr.resume();
    child.stdin.on("error", () => {
      /* close reports a safe failure */
    });
    child.on("error", () => finish({ status: "failed" }));
    child.on("close", (code) => {
      try {
        const result = JSON.parse(output);
        if (code !== 0) {
          finish({ status: "failed" });
          return;
        }
        if (["existing", "available"].includes(result.status)) {
          finish({ status: result.status });
          return;
        }
        if (
          result.status === "created" &&
          typeof result.email === "string" &&
          /^[A-Za-z0-9_-]{12}$/u.test(result.password)
        ) {
          finish({
            status: "created",
            email: result.email,
            password: result.password,
          });
          return;
        }
      } catch {
        /* untrusted diagnostics never escape */
      }
      finish({ status: "failed" });
    });
    child.stdin.end(
      JSON.stringify({ connection, ...identity, inspect: !identity })
    );
  });

export interface AdminPrompts {
  select: (
    environments: DatabaseEnvironment[]
  ) => Promise<DatabaseEnvironment[]>;
  identity: () => Promise<{ name: string; email: string }>;
  report: (
    environment: DatabaseEnvironment,
    result: AdminResult,
    saved: boolean
  ) => void;
  cancelled: () => void;
}

export async function saveDevelopmentAdmin(
  directory: string,
  environment: DatabaseEnvironment,
  result: AdminResult
) {
  if (environment !== "development" || result.status !== "created") {
    return false;
  }
  await savePrivateEnvironment(
    directory,
    new Map([
      ["DEV_ADMIN_USER", serializeCredential(result.email)],
      ["DEV_ADMIN_PASSWORD", serializeCredential(result.password)],
    ])
  );
  return true;
}

// This stage runs only after the destination is durable. Cancellation or partial
// failure never removes the project or reverses successful database operations.
export async function configureFirstAdministrator(
  directory: string,
  connections: readonly DatabaseConnection[],
  initialization: readonly DatabaseInitialization[],
  prompts: AdminPrompts,
  worker: AdminWorker = runAdminWorker,
  save = saveDevelopmentAdmin
) {
  const ready = connections.filter(
    (connection) =>
      connection.credentials &&
      initialization.some(
        (result) =>
          result.environment === connection.environment &&
          result.connected &&
          ["initialized", "ready"].includes(result.status)
      )
  );
  if (!ready.length) {
    return;
  }
  let interrupted = false;
  const stop = () => {
    interrupted = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const available: DatabaseConnection[] = [];
    for (const connection of ready) {
      if (interrupted) {
        break;
      }
      let result: AdminResult;
      try {
        result = await worker(directory, connection);
      } catch {
        result = { status: "failed" };
      }
      if (result.status === "available") {
        available.push(connection);
      } else {
        prompts.report(connection.environment, result, false);
      }
    }
    if (!available.length || interrupted) {
      return;
    }
    const selected = await prompts.select(
      available.map(({ environment }) => environment)
    );
    if (!available.some(({ environment }) => selected.includes(environment))) {
      return;
    }
    const identity = await prompts.identity();
    for (const connection of available) {
      if (!selected.includes(connection.environment)) {
        continue;
      }
      if (interrupted) {
        break;
      }
      let result: AdminResult;
      let saved = false;
      try {
        result = await worker(directory, connection, identity);
      } catch {
        result = { status: "failed" };
      }
      try {
        saved = await save(directory, connection.environment, result);
      } catch {
        /* Report successful creation even if local saving failed. */
      }
      prompts.report(connection.environment, result, saved);
    }
  } catch {
    prompts.cancelled();
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
