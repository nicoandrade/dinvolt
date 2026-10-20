import { basename, join } from "node:path";

import * as prompts from "@clack/prompts";

import packageJson from "../package.json" with { type: "json" };
import { offerFirstAdministrator } from "./admin-prompts.ts";
import { prepareAuthStarter } from "./auth.ts";
import { developmentInstructions } from "./create-completion.ts";
import {
  createConnections,
  createAdministrators,
  validateAdminOutput,
} from "./create-connections.ts";
import { resolveCreateOptions, CreateInputError } from "./create-options.ts";
import type { CreateOptions } from "./create-options.ts";
import { CreateOutput } from "./create-output.ts";
import {
  createNextProject,
  projectNameError,
  runCreateNextApp,
} from "./create.ts";
import {
  configureDatabaseConnections,
  saveDatabaseConnections,
} from "./database-connections.ts";
import type { DatabaseConnection } from "./database-connections.ts";
import {
  generateInitialMigration,
  initializeDatabaseConnections,
  prepareInitialDatabase,
} from "./database-initialization.ts";
import { databaseConnectionPrompts } from "./database-prompts.ts";
import {
  databases,
  defaultDatabase,
  prepareDatabaseStarter,
} from "./database.ts";
import { checkDevelopmentRuntime, developmentUrl } from "./development.ts";
import { directoryRoot } from "./files.ts";
import { projectOptions } from "./project-prompts.ts";
import { hasAdministration, projectTypes } from "./project-type.ts";
import { loadRegistryBlock, recordRegistryBlock } from "./registry.ts";
import {
  checkPackageManager,
  checkStarter,
  configureProject,
  developmentCommand,
  detectProjectPackageManager,
  linters,
  prepareStarter,
} from "./setup.ts";
import { installProjectSkills, projectSkills } from "./skills.ts";
import { prepareTRPCStarter } from "./trpc.ts";
import { addUIComponents, defaultAdminBlocks, prepareUIStarter } from "./ui.ts";
import { answer } from "./wizard-prompts.ts";

async function completeCreatedDatabase(
  directory: string,
  connections: readonly DatabaseConnection[]
) {
  if (!connections.some((connection) => connection.credentials)) {
    return;
  }
  const initialization = await initializeDatabaseConnections(
    directory,
    connections
  );
  for (const result of initialization) {
    if (
      !["initialized", "ready", "credentials-pending"].includes(result.status)
    ) {
      prompts.log.warn(
        `${result.environment}: database setup needs attention. Run npx dinvolt setup to check it and continue.`
      );
    }
  }
  await offerFirstAdministrator(directory, connections, initialization);
}

async function promptProjectLocation(root: string, defaultName: string) {
  const name = answer(
    await prompts.text({
      message: "What is your project name?",
      initialValue: defaultName,
      validate: projectNameError,
    })
  ).trim();
  const location = answer(
    await prompts.select({
      message: "Where would you like to create the project?",
      options: [
        {
          value: "current" as const,
          label: "Use the current folder",
          hint: root,
        },
        {
          value: "new" as const,
          label: "Create a new folder",
          hint: join(root, name),
        },
      ],
      initialValue: "current" as const,
    })
  );
  return { name, location };
}

function showCreateSummary(
  name: string,
  destination: string,
  configuration: Awaited<ReturnType<typeof projectOptions>>
) {
  const { setup, uiPresets, projectType } = configuration;
  const { packageManager, linter, editors: selectedEditors } = setup;
  const admin = hasAdministration(projectType);
  prompts.note(
    `Name: ${name}\nProject type: ${projectTypes.find((entry) => entry.value === projectType)?.label}\nLocation: ${destination}\n\nTypeScript · Tailwind CSS · Cache Components · App Router · src/\nPackage manager: ${packageManager}\nLinter: ${linters.find((entry) => entry.value === linter)?.label}\nEditors: ${selectedEditors.join(", ") || "None"}\nPublic UI preset: ${uiPresets.public}${admin ? `\nAdmin UI preset: ${uiPresets.admin}\nDatabase: ${databases.find((entry) => entry.value === setup.database)?.label} · Drizzle\nDatabase environments: ${setup.databaseEnvironments?.join(", ")}\nAuthentication: Better Auth · Email/password · Admin plugin\nAPI: tRPC · TanStack Query` : ""}\nSkills: ${
      setup.skills
        ? projectSkills(setup)
            .flatMap((entry) => entry.skills)
            .join(", ")
        : "Manual installation"
    }`,
    "Next.js starter"
  );
}

async function prepareCreate(options: CreateOptions, output: CreateOutput) {
  const { nonInteractive } = output;
  const root = await directoryRoot(options.cwd);
  const defaultName = basename(root);
  if (!nonInteractive) {
    prompts.intro(`Dinvolt ${packageJson.version}`);
  }
  const requested = nonInteractive ? resolveCreateOptions(options) : undefined;
  // Parameterized execution must opt out of the wizard; never silently ignore flags.
  if (
    !nonInteractive &&
    Object.keys(options).some((key) => !["cwd", "input", "json"].includes(key))
  ) {
    throw new CreateInputError(
      "Use --no-input (or --json) when supplying create options, or run npx dinvolt create for the wizard.",
      "no-input"
    );
  }
  const { name, location } =
    requested ?? (await promptProjectLocation(root, defaultName));
  const destination = location === "current" ? root : join(root, name);
  const detected = await detectProjectPackageManager(destination);
  const selection = nonInteractive
    ? resolveCreateOptions(options, detected)
    : undefined;
  const { setup, uiPresets, projectType } =
    selection ?? (await projectOptions(detected));
  output.result.configuration = { ...setup, uiPresets };
  if (selection && options.adminOutput) {
    options.adminOutput = await validateAdminOutput(
      options.adminOutput,
      destination
    );
  }
  checkDevelopmentRuntime();
  const admin = hasAdministration(projectType);
  const connections = admin
    ? selection
      ? await createConnections(options, selection)
      : await configureDatabaseConnections(
          setup.database ?? defaultDatabase,
          setup.databaseEnvironments ?? ["development"],
          databaseConnectionPrompts
        )
    : undefined;
  const { packageManager } = setup;
  const managerVersion = await checkPackageManager(packageManager);
  output.checkInterrupted();
  if (!nonInteractive) {
    showCreateSummary(name, destination, { setup, uiPresets, projectType });
  }
  return {
    root,
    name,
    location,
    selection,
    setup,
    uiPresets,
    projectType,
    admin,
    connections,
    packageManager,
    managerVersion,
  };
}

async function finishCreate(
  project: { name: string; path: string },
  options: CreateOptions,
  state: Awaited<ReturnType<typeof prepareCreate>>,
  output: CreateOutput
) {
  const { setup, selection, connections, packageManager } = state;
  output.result.project = project;
  output.result.administrators = (setup.databaseEnvironments ?? []).map(
    (environment) => ({ environment, status: "pending" })
  );
  if (connections) {
    output.result.database = await initializeDatabaseConnections(
      project.path,
      connections
    );
    if (selection) {
      output.checkInterrupted();
      await createAdministrators(
        project.path,
        options,
        selection,
        connections,
        output.result.database,
        output
      );
    }
    const pending =
      output.result.database.some(
        (entry) => !["initialized", "ready"].includes(entry.status)
      ) ||
      output.result.administrators.some(
        (entry) => entry.status === "pending" || entry.status === "failed"
      );
    if (pending) {
      output.result.status = "needs-attention";
      output.result.nextSteps.push(
        "Run npx dinvolt setup in the project to complete pending database or administrator setup."
      );
    }
    if (
      output.result.database.some(
        (entry) =>
          !["initialized", "ready", "credentials-pending"].includes(
            entry.status
          )
      ) ||
      output.result.administrators.some(
        (entry) =>
          entry.status === "failed" ||
          (selection?.adminEnvironments.includes(entry.environment) &&
            (entry.status === "pending" ||
              (entry.status === "created" && !entry.credentialsSaved)))
      )
    ) {
      process.exitCode = 1;
    }
  }
  output.result.nextSteps.push(
    `cd ${JSON.stringify(project.path)}`,
    developmentCommand(packageManager),
    `Open ${developmentUrl(project.name)}`,
    "See docs/development.md for local development and publishing."
  );
  if (output.interrupted) {
    output.fail(
      new Error(
        "Creation interrupted. Inspect the project and completed operations before retrying."
      ),
      "CANCELLED"
    );
    process.exitCode = 130;
  }
  output.finish();
}

let createOutput: CreateOutput | undefined;

export function getCreateOutput() {
  return createOutput;
}

export async function createProject(options: CreateOptions) {
  const ci = process.env.CI === "true" || process.env.CI === "1";
  const nonInteractive =
    options.input === false ||
    options.json === true ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    ci;
  const output = new CreateOutput(nonInteractive, options.json === true);
  createOutput = output;
  const stop = () => {
    output.interrupted = true;
    process.exitCode = 130;
  };
  if (nonInteractive) {
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
  try {
    await executeCreate(options, output);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

async function executeCreate(options: CreateOptions, output: CreateOutput) {
  const { nonInteractive } = output;
  const state = await prepareCreate(options, output);
  const {
    root,
    name,
    location,
    setup,
    uiPresets,
    projectType,
    admin,
    connections,
    packageManager,
    managerVersion,
  } = state;
  const project = await createNextProject(
    root,
    name,
    location,
    async (path) => {
      await output.step(
        "scaffold",
        "Creating the Next.js application...",
        "Next.js application created.",
        async () => {
          await runCreateNextApp(path, packageManager, true);
          await prepareStarter(path, packageManager, projectType);
          await prepareUIStarter(path, uiPresets, undefined, projectType);
          if (admin) {
            await prepareDatabaseStarter(
              path,
              setup.database,
              setup.databaseEnvironments
            );
            await prepareAuthStarter(
              path,
              setup.database ?? defaultDatabase,
              setup.databaseEnvironments
            );
            await prepareTRPCStarter(path);
          }
        }
      );
      await output.step(
        "dependencies",
        "Configuring Ultracite and installing dependencies...",
        "Ultracite configured and dependencies installed.",
        async () => {
          await configureProject(path, setup, managerVersion);
        }
      );
      await output.step(
        "components",
        admin
          ? "Installing public website and admin panel components..."
          : "Installing public components...",
        admin
          ? "Public website and admin panel components installed."
          : "Public components installed.",
        async () => {
          await addUIComponents(path, ["button"], { target: "public" });
          for (const block of admin ? defaultAdminBlocks : []) {
            await addUIComponents(path, [block], { target: "admin" });
          }
        }
      );
      if (admin) {
        // Include Drizzle's generated JSON in the selected formatter's final pass.
        await output.step(
          "migration",
          "Generating the shared initial database migration...",
          "Shared initial migration generated.",
          () => generateInitialMigration(path)
        );
      }
      await output.step(
        "checks",
        "Applying and checking the selected code standards...",
        "Code standards applied and checked.",
        async () => {
          await checkStarter(path);
          if (admin) {
            await prepareInitialDatabase(path);
          }
          // Creation owns this staging directory; record the final formatted sources.
          for (const block of admin ? defaultAdminBlocks : []) {
            await recordRegistryBlock(
              path,
              await loadRegistryBlock(block, "admin")
            );
          }
        }
      );
      if (setup.skills) {
        await output.step(
          "skills",
          "Installing project agent skills...",
          "Project agent skills installed.",
          async () => {
            await installProjectSkills(path, setup);
          }
        );
      }
      // Save user credentials only after every installer subprocess has finished. They
      // never enter installer diagnostics, formatter output or Git initialization.
      if (connections) {
        await saveDatabaseConnections(path, connections);
      }
    },
    (durable) => {
      output.result.project = durable;
      output.checkInterrupted();
    }
  );
  // The project is now durable at its final destination. No remote mutation
  // may run in the temporary generation callback, whose failure cleans it up.
  if (nonInteractive) {
    await finishCreate(project, options, state, output);
    return;
  }
  if (connections) {
    await completeCreatedDatabase(project.path, connections);
  }
  prompts.note(
    developmentInstructions({
      name: project.name,
      packageManager,
      newDirectory: location === "new",
      admin,
    }),
    "Start developing"
  );
  prompts.outro(`Next.js application created at ${project.path}`);
}
