import * as prompts from "@clack/prompts";

import { configureFirstAdministrator } from "./admin-setup.ts";
import type { AdminPrompts } from "./admin-setup.ts";
import type { DatabaseConnection } from "./database-connections.ts";
import type { DatabaseInitialization } from "./database-initialization.ts";
import { answer } from "./wizard-prompts.ts";

export const firstAdministratorPrompts = (): AdminPrompts => ({
  async select(environments) {
    const now = answer(
      await prompts.confirm({
        message: "Create the first administrator now?",
        initialValue: false,
      })
    );
    if (!now) {
      return [];
    }
    return answer(
      await prompts.multiselect({
        message: "Create an administrator in which ready environments?",
        options: environments.map((environment) => ({
          value: environment,
          label: environment,
        })),
        initialValues: environments.includes("development")
          ? ["development"]
          : [environments[0] ?? "development"],
        required: true,
      })
    );
  },
  async identity() {
    const name = answer(
      await prompts.text({
        message: "Administrator name",
        validate: (value) => (value?.trim() ? undefined : "Enter a name."),
      })
    );
    const email = answer(
      await prompts.text({
        message: "Administrator email",
        validate: (value) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value?.trim() ?? "")
            ? undefined
            : "Enter a valid email.",
      })
    );
    return { name: name.trim(), email: email.trim().toLowerCase() };
  },
  report(environment, result, saved) {
    if (result.status === "created" && !process.stdout.isTTY) {
      throw new Error(
        "Administrator passwords can only be displayed in an interactive terminal."
      );
    }
    if (result.status === "created") {
      prompts.note(
        `Environment: ${environment}\nEmail: ${result.email}\nInitial password: ${result.password}\n${environment === "development" ? (saved ? "Saved DEV_ADMIN_USER and DEV_ADMIN_PASSWORD in the selected ignored private dotenv file for local development sign in." : "Local credential saving failed; save these credentials now.") : "Save these credentials now; they are not stored in project files."}`,
        "Administrator created"
      );
    } else if (result.status === "existing") {
      prompts.log.info(
        `${environment}: an administrator already exists. Existing accounts were preserved.`
      );
    } else {
      prompts.log.warn(
        `${environment}: administrator setup could not complete. The email may already exist or a write may have been interrupted. Check the account state; existing users are never overwritten or promoted. Run dinvolt setup to check the current state and continue.`
      );
    }
  },
  cancelled() {
    prompts.log.info(
      "Administrator setup cancelled. Project and prepared tables preserved; run dinvolt setup to continue later."
    );
  },
});

export async function offerFirstAdministrator(
  directory: string,
  connections: readonly DatabaseConnection[],
  initialization: readonly DatabaseInitialization[]
) {
  if (process.stdin.isTTY && process.stdout.isTTY && !process.exitCode) {
    await configureFirstAdministrator(
      directory,
      connections,
      initialization,
      firstAdministratorPrompts()
    );
  }
}
