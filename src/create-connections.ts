import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import { configureFirstAdministrator } from "./admin-setup.ts";
import type { AdminWorker, saveDevelopmentAdmin } from "./admin-setup.ts";
import { CreateInputError } from "./create-options.ts";
import type { CreateOptions } from "./create-options.ts";
import type { CreateOutput } from "./create-output.ts";
import type {
  ConnectionVerifier,
  DatabaseConnection,
} from "./database-connections.ts";
import {
  connectionFields,
  credentialError,
  databaseVariableName,
  verifyDatabaseConnection,
} from "./database-connections.ts";
import type { DatabaseInitialization } from "./database-initialization.ts";
import type { DatabaseEnvironment, DatabaseProvider } from "./database.ts";

interface Selection {
  setup: {
    database?: DatabaseProvider;
    databaseEnvironments?: DatabaseEnvironment[];
  };
  connect: DatabaseEnvironment[];
}
export async function readCredentialsFile(
  file: string,
  option = "credentials-file"
): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(resolve(file), "utf-8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid object.");
    }
    return value;
  } catch {
    throw new CreateInputError(
      `--${option} must be a readable JSON object. Values are never included in diagnostics.`,
      option
    );
  }
}

export async function createConnections(
  options: CreateOptions,
  selection: Selection,
  verify: ConnectionVerifier = verifyDatabaseConnection
): Promise<DatabaseConnection[]> {
  const connections: DatabaseConnection[] = (
    selection.setup.databaseEnvironments ?? []
  ).map((environment) => ({ environment }));
  if (!options.credentialsFile) {
    return connections;
  }
  const credentials = await readCredentialsFile(options.credentialsFile);
  // Validate every requested environment before starting even read-only probes.
  for (const connection of connections) {
    if (!selection.connect.includes(connection.environment)) {
      continue;
    }
    connection.credentials = {};
    for (const field of connectionFields(selection.setup.database ?? "turso")) {
      const variable = databaseVariableName(field.name, connection.environment);
      const value = credentials[variable];
      if (typeof value !== "string" || credentialError(field.name, value)) {
        throw new CreateInputError(
          `--credentials-file: missing or invalid ${variable}.`,
          "credentials-file"
        );
      }
      connection.credentials[field.name] = value;
    }
  }
  for (const connection of connections) {
    if (
      connection.credentials &&
      (await verify(
        selection.setup.database ?? "turso",
        connection.credentials
      ))
    ) {
      throw new CreateInputError(
        `${connection.environment}: connection verification failed. Check --credentials-file and network access, then retry. No project or database changes were made.`,
        "credentials-file"
      );
    }
  }
  return connections;
}

export async function validateAdminOutput(file: string, destination: string) {
  const path = resolve(file);
  const parent = await realpath(dirname(path));
  const canonical = resolve(parent, basename(path));
  let canonicalDestination: string;
  try {
    canonicalDestination = await realpath(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    canonicalDestination = resolve(
      await realpath(dirname(destination)),
      basename(destination)
    );
  }
  const inside = relative(canonicalDestination, canonical);
  if (
    !inside ||
    (inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))
  ) {
    throw new CreateInputError(
      "--admin-output must be outside the generated project; passwords must not enter its repository.",
      "admin-output"
    );
  }
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return path;
    }
    throw error;
  }
  throw new CreateInputError(
    "--admin-output must name a new file. Existing files are never overwritten.",
    "admin-output"
  );
}

export async function createAdministrators(
  directory: string,
  options: CreateOptions,
  selection: { adminEnvironments: DatabaseEnvironment[] },
  connections: DatabaseConnection[],
  initialization: DatabaseInitialization[],
  output: CreateOutput,
  worker?: AdminWorker,
  save?: typeof saveDevelopmentAdmin
) {
  if (!selection.adminEnvironments.length || !options.adminOutput) {
    return;
  }
  // Reserve a private, exclusive output before account writes. Stream and sync
  // each password immediately so a later failure cannot discard earlier ones.
  const file = openSync(options.adminOutput, "wx", 0o600);
  output.result.credentialsFile = resolve(options.adminOutput);
  try {
    await configureFirstAdministrator(
      directory,
      connections.filter(({ environment }) =>
        selection.adminEnvironments.includes(environment)
      ),
      initialization,
      {
        select: (available) => Promise.resolve(available),
        identity: () =>
          Promise.resolve({
            name: (options.adminName ?? "").trim(),
            email: (options.adminEmail ?? "").trim().toLowerCase(),
          }),
        report: (environment, result, saved) => {
          const status = output.result.administrators.find(
            (entry) => entry.environment === environment
          );
          if (!status) {
            return;
          }
          status.status =
            result.status === "available" ? "pending" : result.status;
          if (result.status === "created") {
            writeSync(
              file,
              `${JSON.stringify({ environment, email: result.email, password: result.password })}\n`
            );
            fsyncSync(file);
            status.credentialsSaved = true;
            if (environment === "development" && !saved) {
              output.result.nextSteps.push(
                "Development login credentials were not saved in .env.local; use the private administrator output file."
              );
            }
          }
        },
        cancelled: () => {
          output.result.status = "needs-attention";
          output.result.nextSteps.push(
            "Administrator setup interrupted or credentials could not be saved. Inspect the private output file and account state before retrying with dinvolt setup."
          );
        },
      },
      worker,
      save
    );
  } finally {
    closeSync(file);
  }
}
