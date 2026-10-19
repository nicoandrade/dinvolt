import * as prompts from "@clack/prompts";

import { credentialError } from "./database-connections.ts";
import type { ConnectionPrompts } from "./database-connections.ts";
import { answer } from "./wizard-prompts.ts";

export const databaseConnectionPrompts: ConnectionPrompts = {
  async configureNow(provider, environments) {
    return answer(
      await prompts.select({
        message: `Connect and initialize ${provider} databases now? (${environments.join(", ")})`,
        initialValue: false,
        options: [
          {
            value: false,
            label: "Complete credentials later",
            hint: "Create the project with pending connections",
          },
          {
            value: true,
            label: "Connect and initialize databases",
            hint: "Creates initial tables in empty databases after project setup; existing schemas are inspected",
          },
        ],
      })
    );
  },
  async credential(context, field, variable) {
    return answer(
      await prompts.password({
        message: `${context} — ${field.label} (${variable})`,
        validate: (value) => credentialError(field.name, value),
      })
    );
  },
  async failure(context, field) {
    prompts.log.warn(
      `${context}: could not verify ${field}. Check credentials, endpoint, TLS and network access. No driver details are displayed to protect secrets.`
    );
    return answer(
      await prompts.select({
        message: `${context} — how would you like to continue?`,
        initialValue: "edit" as const,
        options: [
          {
            value: "edit" as const,
            label: "Correct credentials",
            hint: "Re-enter this environment's values",
          },
          {
            value: "retry" as const,
            label: "Retry verification",
            hint: "Use the same values",
          },
          {
            value: "skip" as const,
            label: "Leave this environment pending",
            hint: "Discard its credentials and continue",
          },
        ],
      })
    );
  },
  async verify(context, action) {
    const spinner = prompts.spinner();
    spinner.start(`${context} — checking connection (SELECT 1)...`);
    try {
      const failure = await action();
      if (failure) {
        spinner.stop(`${context} — connection pending.`);
      } else {
        spinner.stop(
          `${context} — connected. Initial tables will be inspected before administrator setup.`
        );
      }
      return failure;
    } catch {
      spinner.error(`${context} — verification interrupted.`);
      throw new Error("Database verification could not complete.");
    }
  },
};
