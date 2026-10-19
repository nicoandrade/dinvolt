#!/usr/bin/env node
import * as prompts from "@clack/prompts";
import { Command, CommanderError, Option } from "commander";

import packageJson from "../package.json" with { type: "json" };
import {
  getAgentOutput,
  isNonInteractive,
  requireWizardMode,
  runAgentCommand,
} from "./agent-command.ts";
import type { AgentOptions } from "./agent-command.ts";
import { CommandOutput } from "./command-output.ts";
import type { AgentCommand } from "./command-output.ts";
import { getCreateOutput, createProject } from "./create-command.ts";
import { CreateInputError } from "./create-options.ts";
import { databaseEnvironments, databases } from "./database.ts";
import { directoryRoot, requiredProjectFile } from "./files.ts";
import { setupExistingProject } from "./project-setup.ts";
import { projectTypes } from "./project-type.ts";
import { setupAgent } from "./setup-agent.ts";
import type { SetupAgentOptions } from "./setup-agent.ts";
import { linters, editors, packageManagers } from "./setup.ts";
import { addUIComponents, uiTargets } from "./ui.ts";
import type { UIAddOptions } from "./ui.ts";
import { vercelAgent } from "./vercel-agent.ts";
import type { VercelAgentOptions } from "./vercel-agent.ts";
import { setupVercel } from "./vercel-setup.ts";
import { CancelledError } from "./wizard-prompts.ts";

async function runStep(
  pending: string,
  complete: string,
  action: () => Promise<void>
) {
  const spinner = prompts.spinner();
  spinner.start(pending);
  try {
    await action();
    spinner.stop(complete);
  } catch (error) {
    spinner.error(pending);
    throw error;
  }
}

const program = new Command()
  .name("dinvolt")
  .description(
    "Set up projects and technical guidance for building with your AI agent."
  )
  .version(packageJson.version, "-v, --version", "Show the version")
  .helpOption("-h, --help", "Show help")
  .addHelpCommand("help [command]", "Show help for a command")
  .showHelpAfterError();

const createCommand = program
  .command("create")
  .description("Create a Next.js application with the Dinvolt defaults")
  .helpOption("-h, --help", "Show help")
  .option("--cwd <directory>", "Starting directory", ".")
  .option("--no-input", "Never prompt; requires --name and --project-type")
  .option(
    "--json",
    "Emit one JSON result; implies --no-input (help remains text)"
  )
  .option("--name <name>", "Project/package name")
  .addOption(
    new Option(
      "--location <location>",
      "Destination relative to cwd (default: current)"
    ).choices(["current", "new"])
  )
  .addOption(
    new Option(
      "--project-type <type>",
      "Project type (required without interaction)"
    ).choices(projectTypes.map(({ value }) => value))
  )
  .addOption(
    new Option(
      "--package-manager <manager>",
      "Detected manager or Bun by default"
    ).choices([...packageManagers])
  )
  .addOption(
    new Option("--linter <linter>", "Code standards (default: oxlint)").choices(
      linters.map(({ value }) => value)
    )
  )
  .option(
    "--editors <editors>",
    `Comma-separated ${editors.map(({ value }) => value).join(", ")}, or none (default: universal)`
  )
  .option(
    "--public-preset <code>",
    "Public shadcn preset (default: Dinvolt preset)"
  )
  .option(
    "--admin-preset <code>",
    "Admin shadcn preset (default: Dinvolt preset)"
  )
  .addOption(
    new Option(
      "--database <provider>",
      "Database provider (default: turso)"
    ).choices(databases.map(({ value }) => value))
  )
  .option(
    "--database-environments <environments>",
    `Comma-separated ${databaseEnvironments.join(", ")} (default: development)`
  )
  .option("--skills", "Install recommended agent skills (default)")
  .option("--no-skills", "Skip agent skill installation")
  .option(
    "--connect <environments>",
    "Connect and initialize selected database environments; otherwise defer"
  )
  .option(
    "--credentials-file <path>",
    "Private JSON file of database environment variables; requires --connect"
  )
  .option(
    "--admin-environments <environments>",
    "Create first administrator in selected connected environments"
  )
  .option("--admin-name <name>", "First administrator name")
  .option("--admin-email <email>", "First administrator email")
  .option(
    "--admin-output <path>",
    "New private JSONL file outside the project for generated administrator passwords"
  )
  .action(createProject);

const setupCommand = program
  .command("setup")
  .description(
    "Complete credentials, initial databases and administrators in an existing Dinvolt project"
  )
  .option("--cwd <directory>", "Directory inside the project", ".")
  .option(
    "--no-input",
    "Never prompt; inspect connections unless actions are supplied"
  )
  .option("--json", "Emit one JSON result; implies --no-input")
  .option(
    "--status",
    "Inspect connection status without changing files or databases"
  )
  .option(
    "--add-environments <environments>",
    "Enable comma-separated development, staging, production environments"
  )
  .option(
    "--complete <environments>",
    "Verify credentials and initialize/check selected databases"
  )
  .option(
    "--credentials-file <path>",
    "Private JSON database credentials for every selected environment"
  )
  .option(
    "--use-private-env",
    "Use an ignored alternative when the existing dotenv file is tracked"
  )
  .option(
    "--admin-environments <environments>",
    "Create first administrator in selected completed environments"
  )
  .option("--admin-name <name>", "Administrator name")
  .option("--admin-email <email>", "Administrator email")
  .option(
    "--admin-output <path>",
    "New private JSONL file outside the project for generated passwords"
  )
  .action(async (options: SetupAgentOptions) => {
    if (isNonInteractive(options)) {
      await runAgentCommand("setup", options, (output) =>
        setupAgent(options, output)
      );
      return;
    }
    requireWizardMode(options);
    prompts.intro("Dinvolt setup");
    await setupExistingProject(options.cwd);
    prompts.outro("Project setup finished.");
  });

const vercelSetupCommand = program
  .command("vercel")
  .description("Configure Vercel hosting and Git integration")
  .command("setup")
  .description(
    "Connect hosting and environment variables; deployments follow your Git pushes"
  )
  .option("--cwd <directory>", "Directory inside the project", ".")
  .option("--no-input", "Never prompt or start authentication")
  .option("--json", "Emit one JSON result; implies --no-input")
  .option(
    "--apply",
    "Apply explicit hosting choices; connecting Git may trigger a provider build"
  )
  .option("--team <id-or-slug>", "Explicit Vercel team")
  .option(
    "--project <id-or-name>",
    "Existing project; must match any local link"
  )
  .option(
    "--new-project <name>",
    "Create a named project without importing Git initially"
  )
  .option("--git-remote <name>", "Git remote (required when multiple exist)")
  .option("--origin <url>", "Verified public HTTPS production origin")
  .option(
    "--add-domain",
    "Associate the supplied origin if absent; no purchase or DNS changes"
  )
  .option("--preview", "Configure Preview with staging")
  .option("--no-preview", "Configure Production only (non-interactive default)")
  .option(
    "--replace <entries>",
    "Replace listed target:KEY variables; otherwise preserve existing values"
  )
  .option(
    "--email-file <path>",
    "Private JSON remote email settings keyed by production/preview"
  )
  .action(async (options: VercelAgentOptions) => {
    if (isNonInteractive(options)) {
      await runAgentCommand("vercel setup", options, (output) =>
        vercelAgent(options, output)
      );
      return;
    }
    requireWizardMode(options);
    prompts.intro("Dinvolt Vercel setup");
    await setupVercel(options.cwd);
    prompts.outro("Vercel setup finished. Publish through your Git workflow.");
  });

const uiAddCommand = program
  .command("ui")
  .description("Manage the public and admin shadcn/ui components")
  .command("add <components...>")
  .description(
    "Add shadcn/ui components or a packaged @dinvolt block using the selected area's profile"
  )
  .addOption(
    new Option(
      "--target <area>",
      "UI area (project default, or admin for older projects)"
    ).choices([...uiTargets])
  )
  .option("--cwd <directory>", "Project root directory", ".")
  .option(
    "-o, --overwrite",
    "Overwrite existing components in the selected area"
  )
  .option("--no-input", "Never prompt; overwrite remains explicit")
  .option("--json", "Emit one JSON result; implies --no-input")
  .action(
    async (components: string[], options: UIAddOptions & AgentOptions) => {
      if (isNonInteractive(options)) {
        await runAgentCommand("ui add", options, async (output) => {
          const root = await directoryRoot(options.cwd);
          const manifest = JSON.parse(
            await requiredProjectFile(root, "package.json")
          );
          output.result.project = { name: manifest.name, path: root };
          await output.step(
            "components",
            "Installing UI components...",
            "UI components installed.",
            async () => {
              const result = await addUIComponents(root, components, options);
              output.result.details = {
                ...result,
                components,
                overwrite: options.overwrite === true,
              };
            }
          );
        });
        return;
      }
      const pending = `Adding shadcn/ui components to ${options.target ?? "the project default"}...`;
      const complete = `shadcn/ui completed for ${options.target ?? "the project default"}.`;
      const action = async () => {
        await addUIComponents(options.cwd, components, options);
      };
      if (process.stdin.isTTY && process.stdout.isTTY) {
        await runStep(pending, complete, action);
      } else {
        console.log(pending);
        await action();
        console.log(complete);
      }
    }
  );

const rawArguments = process.argv.slice(2);
const endOfOptions = rawArguments.indexOf("--");
const commandName: AgentCommand =
  rawArguments[0] === "setup"
    ? "setup"
    : rawArguments[0] === "vercel"
      ? "vercel setup"
      : rawArguments[0] === "ui"
        ? "ui add"
        : "create";
const jsonRequested =
  ["create", "setup", "vercel", "ui"].includes(rawArguments[0] ?? "") &&
  (endOfOptions === -1
    ? rawArguments
    : rawArguments.slice(0, endOfOptions)
  ).includes("--json");
if (jsonRequested) {
  for (const command of [
    program,
    ...program.commands,
    createCommand,
    setupCommand,
    vercelSetupCommand,
    uiAddCommand,
  ]) {
    command.exitOverride();
    command.configureOutput({
      writeErr: () => {
        // The catch handler emits structured errors on stdout.
      },
    });
  }
}
try {
  // Commander accepts another flag as a required string value. Reject that
  // ambiguity before parsing so a missing value cannot swallow --json.
  const knownOptions = [
    program,
    createCommand,
    setupCommand,
    vercelSetupCommand,
    uiAddCommand,
  ].flatMap((command) => command.options);
  const argumentsBeforeSeparator =
    endOfOptions === -1 ? rawArguments : rawArguments.slice(0, endOfOptions);
  for (const [index, argument] of argumentsBeforeSeparator.entries()) {
    const option = knownOptions.find(
      (entry) => entry.long === argument || entry.short === argument
    );
    if (
      option?.required &&
      knownOptions.some(
        (entry) =>
          entry.long === argumentsBeforeSeparator[index + 1] ||
          (entry.short && entry.short === argumentsBeforeSeparator[index + 1])
      )
    ) {
      throw new CreateInputError(
        `Missing value for ${argument}. Use ${argument}=<value> for a literal value matching another flag.`,
        argument.replace(/^-+/u, "")
      );
    }
  }
  await program.parseAsync();
} catch (error) {
  const currentOutput = getAgentOutput() ?? getCreateOutput();
  if (error instanceof CommanderError && error.exitCode === 0) {
    // --help and --version retain their standard text behavior.
  } else if (currentOutput?.nonInteractive || jsonRequested) {
    const output =
      currentOutput ?? new CommandOutput(true, jsonRequested, commandName);
    const code =
      error instanceof CancelledError || currentOutput?.interrupted
        ? "CANCELLED"
        : error instanceof CommanderError
          ? "INVALID_OPTIONS"
          : `${commandName.replaceAll(" ", "_").toUpperCase()}_FAILED`;
    output.fail(error, code);
    output.finish();
    process.exitCode = code === "CANCELLED" ? 130 : 1;
  } else if (error instanceof CancelledError) {
    prompts.cancel(
      "Operation cancelled. Existing project files and completed operations were preserved."
    );
    process.exitCode = 130;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    if (process.stdin.isTTY && process.stdout.isTTY) {
      prompts.log.error(message);
      prompts.outro("Setup failed.");
    } else {
      console.error(`Error: ${message}`);
    }
    process.exitCode = 1;
  }
}
