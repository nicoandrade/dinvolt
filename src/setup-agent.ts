import type { AgentOptions } from "./agent-command.ts";
import type { CommandOutput } from "./command-output.ts";
import {
  createAdministrators,
  readCredentialsFile,
  validateAdminOutput,
} from "./create-connections.ts";
import { CreateInputError, optionList } from "./create-options.ts";
import {
  connectionFields,
  credentialError,
  databaseVariableName,
  serializeCredential,
} from "./database-connections.ts";
import type {
  DatabaseConnection,
  DatabaseCredentials,
} from "./database-connections.ts";
import { initializeDatabaseConnections } from "./database-initialization.ts";
import { databaseEnvironments } from "./database.ts";
import { requiredProjectFile } from "./files.ts";
import {
  effectiveEnvironment,
  writePrivateEnvironment,
} from "./private-environment.ts";
import {
  addProjectEnvironments,
  findProject,
  projectDatabase,
} from "./project-configuration.ts";
import type { ExistingProject } from "./project-configuration.ts";
import {
  completeConnection,
  ensureAuthentication,
  inspectConnections,
} from "./project-setup.ts";
import type { SetupPrompts } from "./project-setup.ts";

export interface SetupAgentOptions extends AgentOptions {
  status?: boolean;
  addEnvironments?: string;
  complete?: string;
  credentialsFile?: string;
  usePrivateEnv?: boolean;
  adminEnvironments?: string;
  adminName?: string;
  adminEmail?: string;
  adminOutput?: string;
}

export async function setupAgent(
  options: SetupAgentOptions,
  output: CommandOutput,
  dependencies: {
    verify?: Parameters<typeof completeConnection>[3];
    initialize?: typeof initializeDatabaseConnections;
    administrators?: typeof createAdministrators;
  } = {}
) {
  const project = await findProject(options.cwd);
  const manifest = JSON.parse(
    await requiredProjectFile(project.root, "package.json")
  );
  output.result.project = { name: manifest.name, path: project.root };
  const mutating = [
    "addEnvironments",
    "complete",
    "credentialsFile",
    "adminEnvironments",
    "adminName",
    "adminEmail",
    "adminOutput",
    "usePrivateEnv",
  ].some((key) => options[key as keyof SetupAgentOptions] !== undefined);
  if (options.status && mutating) {
    throw new CreateInputError(
      "--status cannot be combined with setup changes.",
      "status"
    );
  }
  if (!project.admin) {
    if (mutating) {
      throw new CreateInputError(
        "Public-only projects have no database or administrator to configure.",
        "complete"
      );
    }
    output.result.details = { projectType: "public", connections: [] };
    output.result.nextSteps.push(
      "Use the project's dev script; no database setup is needed."
    );
    return;
  }
  if (!mutating) {
    const { states } = await inspectConnections(project, dependencies.verify);
    output.result.details = { connections: states };
    if (states.some((entry) => entry.status !== "connected")) {
      output.result.status = "needs-attention";
    }
    output.result.nextSteps.push(
      "Use --complete <environments> to verify/initialize tables; connection status alone does not establish schema or administrator readiness."
    );
    return;
  }
  const { add, admins, inputs } = await prepareSetupActions(options, project);
  const ui: SetupPrompts = {
    action: () => {
      throw new Error("Non-interactive setup does not use an action loop.");
    },
    privateFile: () => {
      if (!options.usePrivateEnv) {
        throw new CreateInputError(
          "The existing dotenv file is tracked. Pass --use-private-env to use the ignored alternative, or arrange a private file first.",
          "use-private-env"
        );
      }
      return Promise.resolve(true);
    },
    report: (message) => {
      output.result.nextSteps.push(message);
    },
    connection: {
      configureNow: () => Promise.resolve(true),
      credential: () => {
        throw new CreateInputError(
          "Missing credentials; supply --credentials-file.",
          "credentials-file"
        );
      },
      failure: (environment) => {
        throw new CreateInputError(
          `${environment}: connection verification failed. Correct credentials or network access and retry.`,
          "credentials-file"
        );
      },
      verify: (_, action) => action(),
    },
  };
  output.checkInterrupted();
  if (add.length) {
    await addProjectEnvironments(project, add);
    output.result.completedSteps.push("environments");
  }
  const ready: DatabaseConnection[] = [];
  const destinations = new Map<string, string>();
  output.result.administrators = admins.map((environment) => ({
    environment,
    status: "pending",
  }));
  for (const { connection, overrides } of inputs) {
    output.checkInterrupted();
    const completed = await completeConnection(
      project,
      connection,
      ui,
      dependencies.verify,
      overrides
    );
    if (!completed) {
      output.result.status = "needs-attention";
      process.exitCode = 1;
      continue;
    }
    output.result.completedSteps.push(`credentials:${connection.environment}`);
    output.checkInterrupted();
    const initialized = await (
      dependencies.initialize ?? initializeDatabaseConnections
    )(project.root, [completed.connection]);
    output.result.database.push(...initialized);
    output.checkInterrupted();
    const auth = await ensureAuthentication(
      project,
      connection.environment,
      completed.file,
      ui
    );
    if (auth) {
      ready.push(completed.connection);
      destinations.set(connection.environment, completed.file);
    } else {
      output.result.status = "needs-attention";
      process.exitCode = 1;
    }
  }
  output.checkInterrupted();
  await (dependencies.administrators ?? createAdministrators)(
    project.root,
    options,
    { adminEnvironments: admins },
    ready,
    output.result.database,
    output,
    undefined,
    async (root, environment, result) => {
      if (environment !== "development" || result.status !== "created") {
        return false;
      }
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
  if (
    output.result.database.some(
      ({ status }) => !["initialized", "ready"].includes(status)
    ) ||
    output.result.administrators.some(
      (entry) =>
        !["existing", "created"].includes(entry.status) ||
        (entry.status === "created" && !entry.credentialsSaved)
    )
  ) {
    output.result.status = "needs-attention";
    process.exitCode = 1;
  }
  output.result.details = {
    environments: projectDatabase(project).environments,
  };
  output.result.nextSteps.push(
    "Restart the development server after environment changes. Review pending schema/history manually; completed operations and existing users are preserved."
  );
}

function validateSetupIdentity(options: SetupAgentOptions, requested: boolean) {
  if (!requested) {
    if (
      [options.adminName, options.adminEmail, options.adminOutput].some(
        (value) => value !== undefined
      )
    ) {
      throw new CreateInputError(
        "Administrator options require --admin-environments.",
        "admin-environments"
      );
    }
    return;
  }
  if (
    !options.adminName?.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(options.adminEmail?.trim() ?? "") ||
    !options.adminOutput
  ) {
    throw new CreateInputError(
      "Provide --admin-name, a valid --admin-email and --admin-output <new-private-file>.",
      "admin-environments"
    );
  }
}

async function prepareSetupActions(
  options: SetupAgentOptions,
  project: ExistingProject
) {
  const db = projectDatabase(project);
  const add =
    options.addEnvironments === undefined
      ? []
      : optionList(
          "add-environments",
          options.addEnvironments,
          databaseEnvironments
        );
  const available = [...new Set([...db.environments, ...add])];
  const complete =
    options.complete === undefined
      ? []
      : optionList("complete", options.complete, available);
  const admins =
    options.adminEnvironments === undefined
      ? []
      : optionList("admin-environments", options.adminEnvironments, complete);
  validateSetupIdentity(options, admins.length > 0);
  if (
    (options.credentialsFile !== undefined || options.usePrivateEnv) &&
    !complete.length
  ) {
    throw new CreateInputError(
      "Credential options require --complete <environments>.",
      "complete"
    );
  }
  if (options.adminOutput) {
    options.adminOutput = await validateAdminOutput(
      options.adminOutput,
      project.root
    );
  }
  const supplied =
    options.credentialsFile === undefined
      ? undefined
      : await readCredentialsFile(options.credentialsFile);
  const inputs: {
    connection: DatabaseConnection;
    overrides: DatabaseCredentials;
  }[] = [];
  // Validate all requested credentials before adding environments or writing files.
  for (const environment of complete) {
    const fields = connectionFields(db.provider);
    const effective = await effectiveEnvironment(
      project.root,
      environment,
      fields.map(({ name }) => databaseVariableName(name, environment))
    );
    const original: DatabaseCredentials = {};
    const overrides: DatabaseCredentials = {};
    for (const field of fields) {
      const variable = databaseVariableName(field.name, environment);
      original[field.name] = effective[variable];
      const value = supplied ? supplied[variable] : original[field.name];
      if (typeof value !== "string" || credentialError(field.name, value)) {
        throw new CreateInputError(
          `Missing or invalid ${variable}. Supply complete values in --credentials-file or the project's private environment.`,
          "credentials-file"
        );
      }
      if (supplied) {
        overrides[field.name] = value;
      }
    }
    inputs.push({
      connection: { environment, credentials: original },
      overrides,
    });
  }
  return { add, admins, inputs };
}
