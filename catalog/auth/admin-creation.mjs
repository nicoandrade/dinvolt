/* eslint-disable preserve-caught-error -- Provider causes can contain credentials, SQL parameters and generated passwords; expose fixed errors only. */
import { randomBytes } from "node:crypto";

export class AdminSetupError extends Error {
  name = "AdminSetupError";
}

const passwordBytes = 9;
export const generateInitialPassword = () =>
  randomBytes(passwordBytes).toString("base64url");

export const migrationCommand = (environment, manager = "bun") => {
  const suffix = environment === "development" ? "" : `:${environment}`;
  const supported = ["bun", "npm", "pnpm", "yarn", "deno", "nub", "aube"];
  const executable = supported.includes(manager) ? manager : "bun";
  return `${executable} run db:migrate${suffix}`;
};

// Inspect codes/causes for classification, but never expose provider messages or SQL.
const errorChain = (error) => {
  const errors = [];
  const visited = new Set();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    errors.push(current);
    current = current.cause;
  }
  return errors;
};

export const isMissingAuthSchema = (error) =>
  errorChain(error).some(
    (cause) =>
      ["42P01", "42703"].includes(cause.code) ||
      /no such (?:table|column)|has no column named/iu.test(cause.message ?? "")
  );

export const checkAdminDatabase = async (
  checkDatabase,
  environment,
  manager
) => {
  try {
    await checkDatabase();
  } catch (error) {
    if (isMissingAuthSchema(error)) {
      throw new AdminSetupError(
        `The ${environment} authentication schema is not ready. Apply the reviewed migrations with "${migrationCommand(environment, manager)}", then run this command again.`
      );
    }
    throw new AdminSetupError(
      `Could not check the ${environment} authentication database. Check its connection, credentials and read permissions. No administrator was created.`
    );
  }
};

export const createInitialAdmin = async (auth, name, email) => {
  const password = generateInitialPassword();
  const context = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = context.password.config;
  if (
    password.length < minPasswordLength ||
    password.length > maxPasswordLength
  ) {
    throw new AdminSetupError(
      "Your Better Auth password policy must allow a 12-character initial password."
    );
  }
  try {
    const result = await auth.api.createUser({
      body: { name, email, password, role: "admin" },
    });
    return { email: result.user.email, password };
  } catch (error) {
    const duplicate = errorChain(error).some((cause) =>
      ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "USER_ALREADY_EXISTS"].includes(
        cause.body?.code ?? cause.code
      )
    );
    if (duplicate) {
      throw new AdminSetupError(
        "An account with these details already exists. Its password and permissions were not changed. Use another email or the existing account's password recovery."
      );
    }
    throw new AdminSetupError(
      "Administrator creation did not complete. Check the database and account state before retrying; an interrupted write may have created the account. Existing accounts are never overwritten."
    );
  }
};

// Wizard-only first administrator policy. Manual commands remain available for
// deliberate creation of additional administrators.
export const createFirstAdmin = async (bootstrap, name, email, manager) => {
  await checkAdminDatabase(
    bootstrap.checkDatabase,
    bootstrap.getDatabaseEnvironment(),
    manager
  );
  if (await bootstrap.hasAdministrator()) {
    return { status: "existing" };
  }
  const result = await createInitialAdmin(bootstrap.auth, name, email);
  return { status: "created", ...result };
};
