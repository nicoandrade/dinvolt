import { randomBytes } from "node:crypto";

import * as prompts from "@clack/prompts";

import { firstAdministratorPrompts } from "./admin-prompts.ts";
import { configureFirstAdministrator } from "./admin-setup.ts";
import {
  connectionFields,
  credentialError,
  databaseVariableName,
  serializeCredential,
  verifyDatabaseConnection,
  databaseConnectionSummary,
} from "./database-connections.ts";
import type {
  DatabaseConnection,
  ConnectionVerifier,
  ConnectionPrompts,
  DatabaseCredentials,
} from "./database-connections.ts";
import { initializeDatabaseConnections } from "./database-initialization.ts";
import type { DatabaseInitialization } from "./database-initialization.ts";
import { databaseConnectionPrompts } from "./database-prompts.ts";
import { databaseEnvironments } from "./database.ts";
import type { DatabaseEnvironment } from "./database.ts";
import { developmentUrl } from "./development.ts";
import { requiredProjectFile } from "./files.ts";
import {
  effectiveEnvironment,
  environmentDestination,
  trackedEnvironment,
  writePrivateEnvironment,
} from "./private-environment.ts";
import {
  addProjectEnvironments,
  findProject,
  projectDatabase,
} from "./project-configuration.ts";
import type { ExistingProject } from "./project-configuration.ts";
import { answer } from "./wizard-prompts.ts";

export interface EnvironmentState {
  environment: DatabaseEnvironment;
  status: "connected" | "credentials-pending" | "connection-failed";
}
export interface SetupPrompts {
  action: (
    states: EnvironmentState[],
    available: DatabaseEnvironment[]
  ) => Promise<
    | { complete: DatabaseEnvironment[] }
    | { add: DatabaseEnvironment[] }
    | undefined
  >;
  connection: ConnectionPrompts;
  privateFile: (tracked: string, alternative: string) => Promise<boolean>;
  report: (message: string) => void;
}
const setupPrompts: SetupPrompts = {
  async action(states, available) {
    prompts.note(
      states
        .map(({ environment, status }) => `${environment}: ${status}`)
        .join("\n"),
      "Current database connections"
    );
    const action = answer(
      await prompts.select({
        message: "What would you like to configure?",
        options: [
          {
            value: "complete",
            label: "Complete selected environments",
            hint: "Verify initial tables and optionally create the first administrator",
          },
          ...(available.length
            ? [
                {
                  value: "add",
                  label: "Add another environment",
                  hint: "Enable it now; credentials can be completed later",
                },
              ]
            : []),
          {
            value: "done",
            label: "Finish and leave pending environments for later",
          },
        ],
      })
    );
    if (action === "done") {
      return;
    }
    const selected = answer(
      await prompts.multiselect({
        message:
          action === "add"
            ? "Enable which environments?"
            : "Complete which environments?",
        options: (action === "add"
          ? available
          : states.map(({ environment }) => environment)
        ).map((env) => ({ value: env, label: env })),
        required: true,
      })
    );
    return action === "add" ? { add: selected } : { complete: selected };
  },
  connection: databaseConnectionPrompts,
  async privateFile(tracked, alternative) {
    return answer(
      await prompts.confirm({
        message: `${tracked} is tracked by Git. Save new secrets in ignored ${alternative} instead?`,
        initialValue: true,
      })
    );
  },
  report: (message) => prompts.log.info(message),
};

export async function inspectConnections(
  project: ExistingProject,
  verify: ConnectionVerifier = verifyDatabaseConnection
) {
  const db = projectDatabase(project);
  const connections: DatabaseConnection[] = [];
  const states: EnvironmentState[] = [];
  for (const environment of db.environments) {
    const fields = connectionFields(db.provider);
    const effective = await effectiveEnvironment(
      project.root,
      environment,
      fields.map(({ name }) => databaseVariableName(name, environment))
    );
    const credentials = Object.fromEntries(
      fields.map(({ name }) => [
        name,
        effective[databaseVariableName(name, environment)],
      ])
    );
    const complete = fields.every(
      ({ name }) => !credentialError(name, credentials[name])
    );
    let failure = true;
    if (complete) {
      try {
        failure = Boolean(await verify(db.provider, credentials));
      } catch {
        /* safe state only */
      }
    }
    connections.push({ environment, credentials });
    states.push({
      environment,
      status: complete
        ? failure
          ? "connection-failed"
          : "connected"
        : "credentials-pending",
    });
  }
  return { connections, states };
}

async function privateDestination(
  project: ExistingProject,
  environment: DatabaseEnvironment,
  ui: SetupPrompts
) {
  const destination = await environmentDestination(project.root);
  if (!(await trackedEnvironment(project.root, destination))) {
    return destination;
  }
  const alternative =
    destination === ".env"
      ? ".env.local"
      : environment === "development"
        ? ".env.development.local"
        : ".env.production.local";
  if (await trackedEnvironment(project.root, alternative)) {
    ui.report(
      `${destination} and ${alternative} are tracked. Leave credentials pending and arrange an untracked Next.js dotenv file before retrying.`
    );
    return;
  }
  return (await ui.privateFile(destination, alternative))
    ? alternative
    : undefined;
}

export async function completeConnection(
  project: ExistingProject,
  connection: DatabaseConnection,
  ui: SetupPrompts,
  verify: ConnectionVerifier = verifyDatabaseConnection,
  overrides: DatabaseCredentials = {}
) {
  const { provider } = projectDatabase(project);
  const { environment } = connection;
  const fields = connectionFields(provider);
  const original = { ...connection.credentials };
  const credentials = { ...original, ...overrides };
  let editAll = false;
  while (true) {
    for (const field of fields) {
      if (editAll || credentialError(field.name, credentials[field.name])) {
        credentials[field.name] = await ui.connection.credential(
          environment,
          field,
          databaseVariableName(field.name, environment)
        );
      }
    }
    const failure = await ui.connection.verify(environment, async () => {
      try {
        return await verify(provider, credentials);
      } catch {
        return { field: fields[0]?.name ?? "TURSO_DATABASE_URL" };
      }
    });
    if (failure) {
      const action = await ui.connection.failure(environment, failure.field);
      if (action === "skip") {
        return;
      }
      editAll = action === "edit";
      continue;
    }
    const variables = new Map(
      fields
        .filter(({ name }) => credentials[name] !== original[name])
        .map(({ name }) => [
          databaseVariableName(name, environment),
          serializeCredential(credentials[name] ?? ""),
        ])
    );
    const file = await privateDestination(project, environment, ui);
    if (!file) {
      return;
    }
    // Dry-run the exact destination through Next's parser BEFORE storing secrets.
    // Inherited and higher-priority dotenv values must not redirect later work.
    const keys = fields.map(({ name }) =>
      databaseVariableName(name, environment)
    );
    const effective = await effectiveEnvironment(
      project.root,
      environment,
      keys,
      { file, variables }
    );
    if (
      fields.some(
        ({ name }) =>
          effective[databaseVariableName(name, environment)] !==
          credentials[name]
      )
    ) {
      ui.report(
        `${environment}: another dotenv file or inherited variable overrides these credentials. Remove the conflicting definitions and rerun dinvolt setup. No new credentials or database changes were made.`
      );
      return;
    }
    await writePrivateEnvironment(project.root, variables, file);
    const actual = await effectiveEnvironment(project.root, environment, keys);
    if (
      fields.some(
        ({ name }) =>
          actual[databaseVariableName(name, environment)] !== credentials[name]
      )
    ) {
      ui.report(
        `${environment}: environment changed during setup; initialization skipped. Recheck dotenv files and inherited variables.`
      );
      return;
    }
    return {
      connection: { environment, credentials },
      file,
      changed: variables.size > 0,
    };
  }
}

export async function ensureAuthentication(
  project: ExistingProject,
  environment: DatabaseEnvironment,
  file: string,
  ui: SetupPrompts
) {
  const current = await effectiveEnvironment(project.root, environment, [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
  ]);
  const variables = new Map<string, string>();
  if (!current.BETTER_AUTH_SECRET || current.BETTER_AUTH_SECRET.length < 32) {
    variables.set(
      "BETTER_AUTH_SECRET",
      serializeCredential(randomBytes(32).toString("base64url"))
    );
  }
  if (!current.BETTER_AUTH_URL && environment === "development") {
    const manifest = JSON.parse(
      await requiredProjectFile(project.root, "package.json")
    );
    variables.set(
      "BETTER_AUTH_URL",
      serializeCredential(developmentUrl(manifest.name))
    );
  }
  if (variables.size) {
    const projected = await effectiveEnvironment(
      project.root,
      environment,
      ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
      { file, variables }
    );
    if (
      !projected.BETTER_AUTH_SECRET ||
      projected.BETTER_AUTH_SECRET.length < 32
    ) {
      ui.report(
        `${environment}: BETTER_AUTH_SECRET is overridden by an empty inherited/higher-priority definition. Fix it before administrator setup.`
      );
      return false;
    }
    await writePrivateEnvironment(project.root, variables, file);
  }
  return { changed: variables.size > 0 };
}

export async function setupExistingProject(
  directory: string,
  ui: SetupPrompts = setupPrompts,
  dependencies: {
    verify?: ConnectionVerifier;
    initialize?: typeof initializeDatabaseConnections;
    administrator?: typeof configureFirstAdministrator;
  } = {}
) {
  const project = await findProject(directory);
  if (!project.metadata.database) {
    ui.report(
      "Public website only: there is no database, authentication or administrator to configure. Start the website with your existing dev script. When your Git repository/main is published, run dinvolt vercel setup. dinvolt setup preserves this project type."
    );
    return;
  }
  const results = new Map<DatabaseEnvironment, DatabaseInitialization>();
  const changes = { any: false };
  let latestConnections: DatabaseConnection[] = [];
  try {
    while (true) {
      const { states, connections } = await inspectConnections(
        project,
        dependencies.verify
      );
      latestConnections = connections.map((connection) =>
        states.some(
          (state) =>
            state.environment === connection.environment &&
            state.status === "connected"
        )
          ? connection
          : { environment: connection.environment }
      );
      const action = await ui.action(
        states,
        databaseEnvironments.filter(
          (env) => !projectDatabase(project).environments.includes(env)
        )
      );
      if (!action) {
        break;
      }
      if ("add" in action) {
        await addProjectEnvironments(project, action.add);
        changes.any = true;
        continue;
      }
      const completed: DatabaseConnection[] = [];
      const destinations = new Map<DatabaseEnvironment, string>();
      for (const connection of connections) {
        if (!action.complete.includes(connection.environment)) {
          continue;
        }
        const result = await completeConnection(
          project,
          connection,
          ui,
          dependencies.verify
        );
        if (!result) {
          continue;
        }
        changes.any ||= result.changed;
        // Recheck/preparation remains sequential for the shared migration history.
        const initialized = await (
          dependencies.initialize ?? initializeDatabaseConnections
        )(project.root, [result.connection]);
        for (const entry of initialized) {
          results.set(entry.environment, entry);
        }
        if (
          !initialized.some(
            (entry) =>
              entry.environment === connection.environment &&
              entry.connected &&
              ["initialized", "ready"].includes(entry.status)
          )
        ) {
          const manifest = JSON.parse(
            await requiredProjectFile(project.root, "package.json")
          );
          ui.report(
            databaseConnectionSummary(
              [result.connection],
              project.metadata.packageManager,
              initialized,
              manifest.scripts ?? {}
            )
          );
          ui.report(
            `${connection.environment}: administrator creation is blocked until database initialization is ready.`
          );
          continue;
        }
        const authentication = await ensureAuthentication(
          project,
          connection.environment,
          result.file,
          ui
        );
        if (authentication) {
          changes.any ||= authentication.changed;
          completed.push(result.connection);
          destinations.set(connection.environment, result.file);
        }
      }
      await (dependencies.administrator ?? configureFirstAdministrator)(
        project.root,
        completed,
        [...results.values()],
        firstAdministratorPrompts(),
        undefined,
        async (root, environment, result) => {
          if (environment !== "development" || result.status !== "created") {
            return false;
          }
          changes.any = true;
          await writePrivateEnvironment(
            root,
            new Map([
              ["DEV_ADMIN_USER", serializeCredential(result.email)],
              ["DEV_ADMIN_PASSWORD", serializeCredential(result.password)],
            ]),
            destinations.get(environment)
          );
          return true;
        }
      );
    }
  } finally {
    const connections = project.metadata.database.environments.map(
      (environment) =>
        latestConnections.find(
          (connection) => connection.environment === environment
        ) ?? { environment }
    );
    const manifest = JSON.parse(
      await requiredProjectFile(project.root, "package.json")
    );
    ui.report(
      databaseConnectionSummary(
        connections,
        project.metadata.packageManager,
        [...results.values()],
        manifest.scripts ?? {}
      )
    );
    ui.report(
      "Later schema changes require review: preserve the initial migration and inspect drizzle/ before running your explicit db:migrate script. Rerun dinvolt setup to complete pending environments. Completed operations and existing users are preserved."
    );
    ui.report(
      "When your Git repository/main is published, run dinvolt vercel setup to configure hosting. Future pushes to main deploy through the Git integration."
    );
    if (changes.any) {
      ui.report("Restart the development server to load environment changes.");
    }
  }
}
