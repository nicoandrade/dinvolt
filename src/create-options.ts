import { projectNameError } from "./create.ts";
import {
  databases,
  databaseEnvironments,
  defaultDatabase,
  normalizeDatabaseEnvironments,
} from "./database.ts";
import {
  defaultProjectType,
  hasAdministration,
  projectTypes,
  projectUITargets,
} from "./project-type.ts";
import type { ProjectType } from "./project-type.ts";
import { editors, linters, packageManagers } from "./setup.ts";
import type { PackageManager, ProjectSetup } from "./setup.ts";
import { defaultUIPresets, normalizeUIPreset } from "./ui-presets.ts";
import type { UIPresets } from "./ui-presets.ts";

export class CreateInputError extends Error {
  readonly code = "INVALID_OPTIONS";
  readonly field: string;
  readonly choices?: readonly string[];
  constructor(message: string, field: string, choices?: readonly string[]) {
    super(message);
    this.name = "CreateInputError";
    this.field = field;
    this.choices = choices;
  }
}

export interface CreateOptions {
  cwd: string;
  input?: boolean;
  json?: boolean;
  name?: string;
  location?: string;
  projectType?: string;
  packageManager?: string;
  linter?: string;
  editors?: string;
  publicPreset?: string;
  adminPreset?: string;
  database?: string;
  databaseEnvironments?: string;
  skills?: boolean;
  connect?: string;
  credentialsFile?: string;
  adminEnvironments?: string;
  adminName?: string;
  adminEmail?: string;
  adminOutput?: string;
}

export function projectDefaults(
  projectType: ProjectType = defaultProjectType,
  detected?: PackageManager
) {
  const admin = hasAdministration(projectType);
  const setup: ProjectSetup = {
    projectType,
    packageManager: detected ?? "bun",
    linter: "oxlint",
    editors: ["universal"],
    ...(admin
      ? {
          database: defaultDatabase,
          databaseEnvironments: ["development" as const],
        }
      : {}),
    skills: true,
  };
  const uiPresets: Partial<UIPresets> = {
    ...(projectType === "admin" ? {} : { public: defaultUIPresets.public }),
    ...(admin ? { admin: defaultUIPresets.admin } : {}),
  };
  return { setup, uiPresets, projectType };
}

function choice<T extends string>(
  field: string,
  value: string | undefined,
  choices: readonly T[],
  fallback?: T
): T {
  const selected = value ?? fallback;
  if (!selected || !choices.includes(selected as T)) {
    throw new CreateInputError(
      `Provide --${field}: ${choices.join(", ")}.`,
      field,
      choices
    );
  }
  return selected as T;
}

export function optionList<T extends string>(
  field: string,
  value: string,
  choices: readonly T[]
): T[] {
  return [
    ...new Set(
      value.split(",").map((entry) => choice(field, entry.trim(), choices))
    ),
  ];
}

export function resolveCreateOptions(
  options: CreateOptions,
  detected?: PackageManager
) {
  const nameError = projectNameError(options.name);
  if (nameError) {
    throw new CreateInputError(`--name: ${nameError}`, "name");
  }
  const location = choice(
    "location",
    options.location,
    ["current", "new"],
    "current"
  );
  const projectType = choice(
    "project-type",
    options.projectType,
    projectTypes.map(({ value }) => value)
  );
  const result = projectDefaults(projectType, detected);
  const { setup, uiPresets } = result;
  setup.packageManager = choice(
    "package-manager",
    options.packageManager,
    packageManagers,
    setup.packageManager
  );
  setup.linter = choice(
    "linter",
    options.linter,
    linters.map(({ value }) => value),
    setup.linter
  );
  setup.editors =
    options.editors === undefined
      ? setup.editors
      : options.editors === "none"
        ? []
        : optionList(
            "editors",
            options.editors,
            editors.map(({ value }) => value)
          );
  setup.skills = options.skills ?? setup.skills;
  for (const target of ["public", "admin"] as const) {
    const value =
      target === "public" ? options.publicPreset : options.adminPreset;
    if (value !== undefined) {
      if (!projectUITargets(projectType).some((area) => area === target)) {
        throw new CreateInputError(
          `This project has no ${target} UI profile.`,
          `${target}-preset`
        );
      }
      try {
        uiPresets[target] = normalizeUIPreset(value, defaultUIPresets[target]);
      } catch {
        throw new CreateInputError(
          `--${target}-preset: provide a valid shadcn preset code.`,
          `${target}-preset`
        );
      }
    }
  }
  if (hasAdministration(projectType)) {
    setup.database = choice(
      "database",
      options.database,
      databases.map(({ value }) => value),
      defaultDatabase
    );
    setup.databaseEnvironments = normalizeDatabaseEnvironments(
      options.databaseEnvironments === undefined
        ? ["development"]
        : optionList(
            "database-environments",
            options.databaseEnvironments,
            databaseEnvironments
          )
    );
  } else {
    const adminOptions = [
      "adminPreset",
      "database",
      "databaseEnvironments",
      "connect",
      "credentialsFile",
      "adminEnvironments",
      "adminName",
      "adminEmail",
      "adminOutput",
    ] as const;
    if (adminOptions.some((key) => options[key] !== undefined)) {
      throw new CreateInputError(
        "Database and administrator options require --project-type public-admin or admin.",
        "project-type",
        ["public-admin", "admin"]
      );
    }
  }
  const { connect, adminEnvironments } = resolveConnectionOptions(
    options,
    setup
  );
  return {
    ...result,
    name: (options.name ?? "").trim(),
    location,
    connect,
    adminEnvironments,
  };
}

function resolveConnectionOptions(options: CreateOptions, setup: ProjectSetup) {
  const connect =
    options.connect === undefined
      ? []
      : optionList(
          "connect",
          options.connect,
          setup.databaseEnvironments ?? []
        );
  if (Boolean(connect.length) !== Boolean(options.credentialsFile)) {
    throw new CreateInputError(
      "Provide both --connect <environments> and --credentials-file <path>, or omit both to connect later.",
      "credentials-file"
    );
  }
  const adminEnvironments =
    options.adminEnvironments === undefined
      ? []
      : optionList("admin-environments", options.adminEnvironments, connect);
  if (adminEnvironments.length) {
    if (!options.adminName?.trim()) {
      throw new CreateInputError(
        "Provide --admin-name with --admin-environments.",
        "admin-name"
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(options.adminEmail?.trim() ?? "")) {
      throw new CreateInputError(
        "Provide a valid --admin-email with --admin-environments.",
        "admin-email"
      );
    }
    if (!options.adminOutput) {
      throw new CreateInputError(
        "Provide --admin-output <new-private-file> to receive generated passwords.",
        "admin-output"
      );
    }
  } else if (
    options.adminName !== undefined ||
    options.adminEmail !== undefined ||
    options.adminOutput !== undefined
  ) {
    throw new CreateInputError(
      "Administrator identity and output require --admin-environments.",
      "admin-environments"
    );
  }
  return { connect, adminEnvironments };
}
