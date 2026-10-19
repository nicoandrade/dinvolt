import type { AgentOptions } from "./agent-command.ts";
import type { CommandOutput } from "./command-output.ts";
import { readCredentialsFile } from "./create-connections.ts";
import { CreateInputError } from "./create-options.ts";
import { requiredProjectFile } from "./files.ts";
import { findProject } from "./project-configuration.ts";
import { vercelRunner } from "./vercel-command.ts";
import { originError } from "./vercel-environment.ts";
import { setupVercel } from "./vercel-setup.ts";
import type { HostingPrompts } from "./vercel-setup.ts";

export interface VercelAgentOptions extends AgentOptions {
  apply?: boolean;
  team?: string;
  project?: string;
  newProject?: string;
  gitRemote?: string;
  origin?: string;
  addDomain?: boolean;
  preview?: boolean;
  replace?: string;
  emailFile?: string;
}

export async function hostingAgentPrompts(
  options: VercelAgentOptions,
  output: CommandOutput
): Promise<HostingPrompts> {
  const { origin, team } = validateHostingOptions(options);
  const targets = options.preview ? ["production", "preview"] : ["production"];
  const replacements = new Set(
    options.replace?.split(",").map((value) => value.trim())
  );
  for (const replacement of replacements) {
    if (
      !/^(?:production|preview):[A-Z][A-Z0-9_]*$/u.test(replacement) ||
      !targets.includes(replacement.split(":")[0] ?? "")
    ) {
      throw new CreateInputError(
        "--replace takes target:KEY entries for configured targets, for example production:NEXT_PUBLIC_SITE_URL.",
        "replace"
      );
    }
  }
  const email = await readHostingEmail(options, targets);
  const emailValue = (id: string | undefined, key: string) => {
    const target = id?.split(":")[1] ?? "";
    const value = (email[target] as Record<string, string> | undefined)?.[key];
    if (!value) {
      throw new CreateInputError(
        "Missing remote email value in --email-file.",
        "email-file"
      );
    }
    return value;
  };
  return {
    destination: {
      team,
      project: options.project,
      newProject: options.newProject,
    },
    choose: (_message, choices, id) => {
      let choice: string | undefined;
      if (id === "project") {
        choice = options.newProject
          ? "create"
          : choices.find(
              (entry) =>
                entry.value === options.project ||
                entry.label === options.project
            )?.value;
      }
      if (id === "git-remote") {
        choice =
          options.gitRemote ??
          (choices.length === 1 ? choices[0]?.value : undefined);
      }
      if (id === "origin") {
        choice =
          choices.find((entry) => entry.value === new URL(origin).hostname)
            ?.value ?? (options.addDomain ? "custom" : undefined);
      }
      if (!choice || !choices.some((entry) => entry.value === choice)) {
        throw new CreateInputError(
          `Provide an available --${id === "origin" ? "origin (or --add-domain)" : id}.`,
          id ?? "selection",
          choices
            .filter((entry) => entry.value !== "custom")
            .map((entry) => entry.value)
        );
      }
      return Promise.resolve(choice);
    },
    confirm: (_message, id) => {
      if (id === "login") {
        throw new CreateInputError(
          "Vercel authentication failed. Authenticate separately with vercel login or supply VERCEL_TOKEN, then retry.",
          "authentication"
        );
      }
      if (id === "database-setup") {
        throw new CreateInputError(
          "Complete production/staging database setup separately with dinvolt setup before configuring hosting.",
          "database"
        );
      }
      if (id === "preview") {
        return Promise.resolve(options.preview === true);
      }
      if (id?.startsWith("email:")) {
        return Promise.resolve(Boolean(email[id.split(":")[1] ?? ""]));
      }
      if (id?.startsWith("replace:")) {
        return Promise.resolve(replacements.has(id.slice(8)));
      }
      if (["apply", "use-project"].includes(id ?? "")) {
        return Promise.resolve(true);
      }
      if (id === "create-project") {
        return Promise.resolve(Boolean(options.newProject));
      }
      if (id === "add-domain") {
        return Promise.resolve(options.addDomain === true);
      }
      throw new CreateInputError(
        "An additional hosting decision is required. Run the interactive wizard or update the explicit options.",
        "selection"
      );
    },
    text: (_message, _initial, id) => {
      if (id === "project-name" && options.newProject) {
        return Promise.resolve(options.newProject);
      }
      if (id === "origin") {
        return Promise.resolve(origin);
      }
      if (id?.startsWith("email-from:")) {
        return Promise.resolve(emailValue(id, "EMAIL_FROM"));
      }
      throw new CreateInputError(
        "An explicit hosting value is missing.",
        id ?? "selection"
      );
    },
    secret: (_message, id) => Promise.resolve(emailValue(id, "RESEND_API_KEY")),
    report: (message) => {
      output.result.nextSteps.push(message);
    },
    progress: (step, details) => {
      output.checkInterrupted();
      if (step !== "plan") {
        output.result.completedSteps.push(step);
      }
      if (details) {
        output.result.details = { ...output.result.details, [step]: details };
      }
    },
  };
}

export async function vercelAgent(
  options: VercelAgentOptions,
  output: CommandOutput,
  dependencies: NonNullable<Parameters<typeof setupVercel>[2]> = {}
) {
  const ui = await hostingAgentPrompts(options, output);
  const project = await findProject(options.cwd);
  if (options.emailFile && !project.admin) {
    throw new CreateInputError(
      "Public-only projects have no password recovery email to configure.",
      "email-file"
    );
  }
  const manifest = JSON.parse(
    await requiredProjectFile(project.root, "package.json")
  );
  output.result.project = { name: manifest.name, path: project.root };
  const run = dependencies.run ?? vercelRunner(project.root);
  const result = await setupVercel(project.root, ui, {
    ...dependencies,
    run: (command) => {
      output.checkInterrupted();
      if (command.interactive) {
        throw new CreateInputError(
          "Interactive authentication is unavailable; authenticate separately and retry.",
          "authentication"
        );
      }
      return run(command);
    },
  });
  output.result.details = { ...output.result.details, hosting: result };
  if (result.emailPending.length) {
    output.result.status = "needs-attention";
  }
}

function validateHostingOptions(options: VercelAgentOptions) {
  if (!options.apply) {
    throw new CreateInputError(
      "Pass --apply to configure hosting and variables. Git connection can trigger an initial provider build; no deploy command is run.",
      "apply"
    );
  }
  if (!options.team || !/^[\w-]+$/u.test(options.team)) {
    throw new CreateInputError("Provide --team <id-or-slug>.", "team");
  }
  if (Boolean(options.project) === Boolean(options.newProject)) {
    throw new CreateInputError(
      "Provide exactly one of --project <id-or-name> or --new-project <name>.",
      "project"
    );
  }
  if (!/^[\w-]+$/u.test(options.project ?? options.newProject ?? "")) {
    throw new CreateInputError("Invalid project identifier.", "project");
  }
  if (!options.origin || originError(options.origin)) {
    throw new CreateInputError(
      "Provide --origin with the project's public HTTPS origin.",
      "origin"
    );
  }
  const { origin } = options;
  return { origin, team: options.team };
}

async function readHostingEmail(
  options: VercelAgentOptions,
  targets: string[]
) {
  const email = options.emailFile
    ? await readCredentialsFile(options.emailFile, "email-file")
    : {};
  for (const [target, value] of Object.entries(email)) {
    if (
      !targets.includes(target) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some(
        (key) => !["RESEND_API_KEY", "EMAIL_FROM"].includes(key)
      )
    ) {
      throw new CreateInputError(
        "--email-file must map configured targets to RESEND_API_KEY and EMAIL_FROM.",
        "email-file"
      );
    }
    for (const key of ["RESEND_API_KEY", "EMAIL_FROM"]) {
      const entry = (value as Record<string, unknown>)[key];
      if (typeof entry !== "string" || !entry.trim() || /[\r\n]/u.test(entry)) {
        throw new CreateInputError(
          `--email-file: missing or invalid ${key} for ${target}.`,
          "email-file"
        );
      }
    }
  }
  return email;
}
