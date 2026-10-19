/* eslint-disable unicorn/no-top-level-side-effects -- This is an interactive CLI entry point. */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { isCancel, text } from "@clack/prompts";
import { createJiti } from "jiti";

import {
  AdminSetupError,
  checkAdminDatabase,
  createInitialAdmin,
} from "./admin-creation.mjs";

const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value?.trim() ?? "");

const main = async () => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      name: { type: "string" },
      email: { type: "string" },
      help: { short: "h", type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Create an administrator with a generated 12-character initial password.\nOptions: --name <name> --email <email>\nRun the matching auth:create-admin[:staging|:production] script in an interactive terminal."
    );
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new AdminSetupError(
      "Run this command in an interactive terminal so the initial password is not written to redirected logs."
    );
  }
  const metadata = JSON.parse(await readFile(".dinvolt/config.json", "utf-8"));
  const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
  let bootstrap;
  try {
    ({ bootstrap } = await jiti.import("./admin-bootstrap.ts"));
  } catch {
    throw new AdminSetupError(
      "Could not load administrator setup. Check the selected database environment, its credentials, BETTER_AUTH_SECRET and auth.config.ts."
    );
  }
  const environment = bootstrap.getDatabaseEnvironment();
  console.log(`Create administrator · ${environment}`);
  await checkAdminDatabase(
    bootstrap.checkDatabase,
    environment,
    metadata.packageManager
  );
  const name =
    values.name ??
    (await text({
      message: "Administrator name",
      placeholder: "Alex Morgan",
      validate: (value) => (value?.trim() ? undefined : "Enter a name."),
    }));
  if (isCancel(name)) {
    console.log("Cancelled. No administrator was created.");
    return;
  }
  const email =
    values.email ??
    (await text({
      message: "Administrator email",
      placeholder: "alex@example.com",
      validate: (value) =>
        validEmail(value) ? undefined : "Enter a valid email.",
    }));
  if (isCancel(email)) {
    console.log("Cancelled. No administrator was created.");
    return;
  }
  if (!name.trim() || !validEmail(email)) {
    throw new AdminSetupError(
      "Enter a name and a valid email. No administrator was created."
    );
  }
  const result = await createInitialAdmin(
    bootstrap.auth,
    name.trim(),
    email.trim().toLowerCase()
  );
  console.log(
    `Administrator created in ${environment}.\nEmail: ${result.email}\nInitial password: ${result.password}\nSave it now; this command will not display it again.`
  );
  // Show only the origin, never embedded credentials, query parameters or tokens.
  try {
    const url = new URL(process.env.BETTER_AUTH_URL);
    if (["http:", "https:"].includes(url.protocol)) {
      console.log(`Admin panel: ${url.origin}/admin`);
    }
  } catch {
    console.log("Open /admin on your application's configured origin.");
  }
};

try {
  await main();
} catch (error) {
  // Main only exposes fixed errors; parse/config/loader failures must not echo arguments.
  const safe = error instanceof AdminSetupError;
  console.error(
    safe
      ? error.message
      : "Could not create the administrator. Check the command options and project configuration."
  );
  process.exitCode = 1;
}
