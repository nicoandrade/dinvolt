import { createRequire } from "node:module";

import type postgres from "pg";
import type { PoolConfig } from "pg";

import type { DatabaseInitialization } from "./database-initialization.ts";
import { databases, normalizeDatabaseEnvironments } from "./database.ts";
import type { DatabaseEnvironment, DatabaseProvider } from "./database.ts";
import { writePrivateEnvironment } from "./private-environment.ts";
import type { PackageManager } from "./setup.ts";

export type CredentialName =
  | "TURSO_DATABASE_URL"
  | "TURSO_AUTH_TOKEN"
  | "DATABASE_URL"
  | "DATABASE_URL_DIRECT";
export type DatabaseCredentials = Partial<Record<CredentialName, string>>;
export interface DatabaseConnection {
  environment: DatabaseEnvironment;
  credentials?: DatabaseCredentials;
}
export interface ConnectionField {
  name: CredentialName;
  label: string;
}

export function connectionFields(
  provider: DatabaseProvider
): ConnectionField[] {
  return provider === "turso"
    ? [
        { name: "TURSO_DATABASE_URL", label: "Database URL" },
        { name: "TURSO_AUTH_TOKEN", label: "Auth token" },
      ]
    : [
        {
          name: "DATABASE_URL",
          label: "Application URL (PgBouncer, port 6432)",
        },
        {
          name: "DATABASE_URL_DIRECT",
          label: "Direct migration URL (port 5432)",
        },
      ];
}

// Reject ambiguous dotenv/control syntax before any network request. URL reserved
// characters must be percent-encoded; tokens are opaque, single-line values.
export function credentialError(
  name: CredentialName,
  value: string | undefined
): string | undefined {
  if (
    value &&
    [
      "your-turso-auth-token",
      "turso://your-database-your-organization.turso.io",
      "postgresql://app.your-branch:your-password@your-host.horizon.psdb.cloud:6432/your-database?sslmode=verify-full",
      "postgresql://migrations.your-branch:your-password@your-host.horizon.psdb.cloud:5432/your-database?sslmode=verify-full",
    ].includes(value)
  ) {
    return "Replace the example placeholder with your database credential.";
  }
  if (!value || value !== value.trim() || /[\s\p{Cc}'"`\\]/u.test(value)) {
    return "Enter a nonempty value without whitespace or quotes. Percent-encode reserved URL characters.";
  }
  if (name === "TURSO_AUTH_TOKEN") {
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a complete database URL.";
  }
  if (!url.hostname || url.hash) {
    return "Enter a database URL with a hostname and no fragment.";
  }
  if (name === "TURSO_DATABASE_URL") {
    if (
      !["turso:", "libsql:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      !["", "/"].includes(url.pathname)
    ) {
      return "Use a turso://, libsql:// or https:// database origin without user info, path or query parameters.";
    }
    return;
  }
  return postgresCredentialError(name, url);
}

function postgresCredentialError(name: CredentialName, url: URL) {
  const port = name === "DATABASE_URL" ? "6432" : "5432";
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.port !== port ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode") ||
    url.searchParams.getAll("sslmode").length !== 1
  ) {
    return `Use a PostgreSQL URL with user, password, database, port ${port} and only ?sslmode=verify-full.`;
  }
  try {
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    decodeURIComponent(url.pathname.slice(1));
  } catch {
    return "Use valid percent encoding in the PostgreSQL URL.";
  }
}

export interface ConnectionFailure {
  field: CredentialName;
}
export type ConnectionVerifier = (
  provider: DatabaseProvider,
  credentials: DatabaseCredentials
) => Promise<ConnectionFailure | undefined>;

export type ConnectionRequest = (
  url: URL,
  options: RequestInit
) => Promise<Response>;

async function verifyTurso(
  credentials: DatabaseCredentials,
  timeout: number,
  request: ConnectionRequest
) {
  const url = new URL(
    (credentials.TURSO_DATABASE_URL ?? "").replace(
      /^(?:turso|libsql):/u,
      "https:"
    )
  );
  // Turso's HTTP pipeline executes only SELECT 1 and closes the stream in the
  // same request, including on SQL failure. Abort covers headers AND body.
  // https://github.com/tursodatabase/turso/blob/main/serverless/PROTOCOL.md
  const response = await request(new URL("/v3/pipeline", url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.TURSO_AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql: "SELECT 1", want_rows: true } },
        { type: "close" },
      ],
    }),
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Connection failed.");
  }
  const result = (await response.json()) as {
    baton?: string | null;
    results?: {
      type: string;
      response?: { type: string; result?: { rows?: { value: string }[][] } };
    }[];
  };
  if (
    (result.baton !== null && result.baton !== undefined) ||
    result.results?.[0]?.type !== "ok" ||
    result.results[0].response?.type !== "execute" ||
    result.results[0].response.result?.rows?.[0]?.[0]?.value !== "1" ||
    result.results[1]?.type !== "ok" ||
    result.results[1].response?.type !== "close"
  ) {
    throw new Error("Connection failed.");
  }
}

interface ProbePool {
  connect: () => Promise<{
    query: (sql: string) => Promise<unknown>;
    release: (destroy: boolean) => void;
  }>;
  on: (event: "error", listener: () => void) => unknown;
  end: () => Promise<void>;
}
type PoolFactory = (config: PoolConfig) => ProbePool;

const createPool: PoolFactory = (config) => {
  // Resolve the runtime dependency from the installed CLI; avoid bundling pg's
  // optional native binding into the Node ESM build.
  const pg = createRequire(import.meta.url)("pg") as typeof postgres;
  return new pg.Pool(config);
};

async function verifyPostgres(
  value: string,
  timeout: number,
  poolFactory: PoolFactory
) {
  const url = new URL(value);
  const pool = poolFactory({
    // Every endpoint/identity field is explicit, so PG* environment variables
    // cannot redirect the probe. Do not accept URL options that override these.
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: timeout,
    query_timeout: timeout,
    idleTimeoutMillis: timeout,
    allowExitOnIdle: true,
  });
  // Drivers may emit an idle-connection error outside query promises. Never log
  // a driver error, which can contain passwords and connection strings.
  pool.on("error", () => {
    /* Connection errors are reported through the safe probe result. */
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release(true);
    }
  } finally {
    await pool.end();
  }
}

export async function verifyDatabaseConnection(
  provider: DatabaseProvider,
  credentials: DatabaseCredentials,
  options: {
    timeout?: number;
    request?: ConnectionRequest;
    poolFactory?: PoolFactory;
  } = {}
): Promise<ConnectionFailure | undefined> {
  const timeout = options.timeout ?? 8000;
  for (const field of connectionFields(provider)) {
    if (credentialError(field.name, credentials[field.name])) {
      return { field: field.name };
    }
  }
  if (provider === "turso") {
    try {
      await verifyTurso(credentials, timeout, options.request ?? fetch);
    } catch {
      return { field: "TURSO_DATABASE_URL" };
    }
  } else {
    for (const field of connectionFields(provider)) {
      try {
        await verifyPostgres(
          credentials[field.name] ?? "",
          timeout,
          options.poolFactory ?? createPool
        );
      } catch {
        return { field: field.name };
      }
    }
  }
}

export interface ConnectionPrompts {
  configureNow: (
    provider: string,
    environments: readonly DatabaseEnvironment[]
  ) => Promise<boolean>;
  credential: (
    context: string,
    field: ConnectionField,
    variable: string
  ) => Promise<string>;
  failure: (
    context: string,
    field: CredentialName
  ) => Promise<"edit" | "retry" | "skip">;
  verify: (
    context: string,
    action: () => Promise<ConnectionFailure | undefined>
  ) => Promise<ConnectionFailure | undefined>;
}

async function safeVerify(
  verify: ConnectionVerifier,
  provider: DatabaseProvider,
  credentials: DatabaseCredentials
) {
  try {
    return await verify(provider, credentials);
  } catch {
    return {
      field: connectionFields(provider)[0]?.name ?? "TURSO_DATABASE_URL",
    };
  }
}

export function databaseVariableName(
  name: CredentialName,
  environment: DatabaseEnvironment
) {
  return environment === "development"
    ? name
    : `${name}_${environment.toUpperCase()}`;
}

export async function configureDatabaseConnections(
  provider: DatabaseProvider,
  selectedEnvironments: readonly DatabaseEnvironment[],
  prompts: ConnectionPrompts,
  verify: ConnectionVerifier = verifyDatabaseConnection
): Promise<DatabaseConnection[]> {
  const environments = normalizeDatabaseEnvironments(selectedEnvironments);
  const connections: DatabaseConnection[] = environments.map((environment) => ({
    environment,
  }));
  const label = databases.find(
    (database) => database.value === provider
  )?.label;
  if (!label) {
    throw new Error("Unknown database provider.");
  }
  if (!(await prompts.configureNow(label, environments))) {
    return connections;
  }
  for (const connection of connections) {
    const context = `${label} · ${connection.environment}`;
    let credentials: DatabaseCredentials = {};
    let action: "edit" | "retry" | "skip" = "edit";
    while (action !== "skip") {
      if (action === "edit") {
        credentials = {};
        for (const field of connectionFields(provider)) {
          credentials[field.name] = await prompts.credential(
            context,
            field,
            databaseVariableName(field.name, connection.environment)
          );
        }
      }
      // Do not allow an unexpected driver exception to escape to CLI logging.
      const currentCredentials = credentials;
      const failure = await prompts.verify(context, () =>
        safeVerify(verify, provider, currentCredentials)
      );
      if (!failure) {
        connection.credentials = credentials;
        break;
      }
      action = await prompts.failure(context, failure.field);
    }
  }
  return connections;
}

// Next's dotenv expansion requires escaping dollars even inside single quotes.
// Input validation excludes quotes, backslashes and newlines; single quoting
// preserves # and = without interpolation or shell evaluation.
export function serializeCredential(value: string) {
  if (!value || /[\s\p{Cc}'"`\\]/u.test(value)) {
    throw new Error("Could not serialize a database credential safely.");
  }
  return `'${value.replaceAll("$", "\\$")}'`;
}

export async function saveDatabaseConnections(
  directory: string,
  connections: readonly DatabaseConnection[]
) {
  const variables = new Map<string, string>();
  for (const connection of connections) {
    for (const [name, value] of Object.entries(connection.credentials ?? {})) {
      variables.set(
        databaseVariableName(name as CredentialName, connection.environment),
        serializeCredential(value)
      );
    }
  }
  const { effectiveEnvironment } = await import("./private-environment.ts");
  for (const connection of connections) {
    if (!connection.credentials) {
      continue;
    }
    const keys = Object.keys(connection.credentials) as CredentialName[];
    const effective = await effectiveEnvironment(
      directory,
      connection.environment,
      keys.map((name) => databaseVariableName(name, connection.environment)),
      { file: ".env.local", variables }
    );
    if (
      keys.some(
        (name) =>
          effective[databaseVariableName(name, connection.environment)] !==
          connection.credentials?.[name]
      )
    ) {
      throw new Error(
        `${connection.environment}: inherited variables or higher-priority dotenv files override the entered credentials. Remove conflicting definitions and retry; no database changes were made.`
      );
    }
  }
  await savePrivateEnvironment(directory, variables);
}

// Shared atomic, private dotenv writer for explicitly authorized local credentials.
export async function savePrivateEnvironment(
  directory: string,
  variables: ReadonlyMap<string, string>
) {
  await writePrivateEnvironment(directory, variables);
}

export function databaseConnectionSummary(
  connections: readonly DatabaseConnection[],
  manager: PackageManager,
  initialization: readonly DatabaseInitialization[] = [],
  scripts?: Record<string, string>
) {
  const descriptions: Record<DatabaseInitialization["status"], string> = {
    "review-required":
      "Local schema or migration changes require review — no database changes applied; review db:generate and explicit db:migrate",
    "credentials-pending":
      "Credentials pending — run dinvolt setup to verify preparation",
    initialized: "Connected · initial migration applied · auth tables ready",
    ready: "Connected · initial migration already applied · auth tables ready",
    incompatible:
      "Connected · unknown or incompatible schema/history — initialization pending; no schema changes applied",
    failed:
      "Initialization failed — check connection, permissions and migration state; project and credentials preserved",
    interrupted:
      "Initialization interrupted — project and credentials preserved; retry db:init to inspect persisted state",
    "application-pending":
      "Direct database ready · application connection/schema pending — verify both URLs",
  };
  const summary = connections
    .map(({ environment, credentials }) => {
      const result = initialization.find(
        (entry) => entry.environment === environment
      );
      const description = result
        ? descriptions[result.status]
        : credentials
          ? "Connected (read-only check passed) · tables pending"
          : descriptions["credentials-pending"];
      const suffix = environment === "development" ? "" : `:${environment}`;
      const ready = result && ["initialized", "ready"].includes(result.status);
      const maintenance = ready || result?.status === "review-required";
      const script = `${maintenance ? "db:migrate" : "db:init"}${suffix}`;
      const next =
        !scripts || scripts[script]
          ? `${manager} run ${script}`
          : "dinvolt setup (the manual database script is absent)";
      return `${environment}: ${description}${result?.status === "failed" ? ` · connection ${result.connected ? "verified" : "pending"}` : ""}\n  ${next}`;
    })
    .join("\n");
  return `${summary}\n\ndb:init retries only the unchanged initial migration; unknown existing schemas require manual review. Later changes: db:generate, review, then db:migrate for the explicit environment.\nPreserve your BETTER_AUTH_SECRET and private dotenv files.\nSee docs/database.md, docs/auth.md and docs/trpc.md.`;
}
