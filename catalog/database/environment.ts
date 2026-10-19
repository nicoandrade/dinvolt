// Shared by trusted server code and database tools. Never import into client components.
export const configuredDatabaseEnvironments: readonly string[] = [
  "development",
];

type EnvironmentVariables = Record<string, string | undefined>;

export const getDatabaseEnvironment = (
  env: EnvironmentVariables = process.env
) => {
  const deploymentEnvironments: Record<string, string> = {
    development: "development",
    production: "production",
    preview: "staging",
  };
  const environment =
    env.DINVOLT_DATABASE_ENV ??
    deploymentEnvironments[env.VERCEL_ENV ?? "development"];
  if (
    !environment ||
    !["development", "staging", "production"].includes(environment)
  ) {
    throw new Error(
      "Invalid database environment. Set DINVOLT_DATABASE_ENV to development, staging or production; VERCEL_ENV must be development, preview or production."
    );
  }
  if (!configuredDatabaseEnvironments.includes(environment)) {
    throw new Error(
      `Database environment ${environment} is not configured. Add it to src/db/environment.ts and configure its credentials; see docs/database.md.`
    );
  }
  return environment;
};

export const databaseVariable = (
  name: string,
  required = true,
  env: EnvironmentVariables = process.env
) => {
  const environment = getDatabaseEnvironment(env);
  const key =
    environment === "development"
      ? name
      : `${name}_${environment.toUpperCase()}`;
  const value = env[key]?.trim();
  if (required && !value) {
    throw new Error(
      `Set ${key} in .env.local or the ${environment} deployment environment before using the database.`
    );
  }
  return value ?? "";
};
