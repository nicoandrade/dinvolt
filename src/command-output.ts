import { stripVTControlCharacters } from "node:util";

import * as prompts from "@clack/prompts";

import { CreateInputError } from "./create-options.ts";
import type { DatabaseInitialization } from "./database-initialization.ts";
import type { DatabaseEnvironment } from "./database.ts";
import type { ProjectSetup } from "./setup.ts";
import type { UIPresets } from "./ui-presets.ts";
import { CancelledError } from "./wizard-prompts.ts";

export interface AdministratorStatus {
  environment: DatabaseEnvironment;
  status: "pending" | "created" | "existing" | "failed";
  credentialsSaved?: boolean;
}

export type AgentCommand = "create" | "setup" | "vercel setup" | "ui add";

export class CommandOutput {
  readonly result: {
    schemaVersion: 1;
    command: AgentCommand;
    status: "completed" | "needs-attention" | "failed" | "cancelled";
    project: { name: string; path: string } | null;
    configuration?: ProjectSetup & { uiPresets: Partial<UIPresets> };
    completedSteps: string[];
    database: DatabaseInitialization[];
    administrators: AdministratorStatus[];
    credentialsFile?: string;
    nextSteps: string[];
    details?: Record<string, unknown>;
    error?: {
      code: string;
      message: string;
      field?: string;
      choices?: readonly string[];
    };
  } = {
    schemaVersion: 1,
    command: "create",
    status: "completed",
    project: null,
    completedSteps: [],
    database: [],
    administrators: [],
    nextSteps: [],
  };

  interrupted = false;

  checkInterrupted() {
    if (this.interrupted) {
      throw new CancelledError("Operation interrupted.");
    }
  }

  readonly nonInteractive: boolean;
  readonly json: boolean;
  constructor(
    nonInteractive: boolean,
    json: boolean,
    command: AgentCommand = "create"
  ) {
    this.nonInteractive = nonInteractive;
    this.json = json;
    this.result.command = command;
  }

  async step(
    id: string,
    pending: string,
    complete: string,
    action: () => Promise<void>
  ) {
    this.checkInterrupted();
    const spinner = this.nonInteractive ? undefined : prompts.spinner();
    spinner?.start(pending);
    if (this.nonInteractive) {
      process.stderr.write(`${pending}\n`);
    }
    try {
      await action();
      this.checkInterrupted();
      this.result.completedSteps.push(id);
      spinner?.stop(complete);
    } catch (error) {
      spinner?.error(pending);
      throw error;
    }
  }

  fail(error: unknown, code = "CREATE_FAILED") {
    this.result.status = code === "CANCELLED" ? "cancelled" : "failed";
    this.result.error = {
      code: error instanceof CreateInputError ? error.code : code,
      message: stripVTControlCharacters(
        error instanceof Error ? error.message : String(error)
      ),
      ...(error instanceof CreateInputError
        ? { field: error.field, choices: error.choices }
        : {}),
    };
  }

  finish() {
    if (this.json) {
      process.stdout.write(`${JSON.stringify(this.result)}\n`);
    } else if (this.result.error) {
      process.stderr.write(`Error: ${this.result.error.message}\n`);
    } else if (this.nonInteractive) {
      process.stdout.write(
        `${this.result.command === "create" ? `Next.js application created at ${this.result.project?.path}` : `${this.result.command}${this.result.project ? ` at ${this.result.project.path}` : ""}`}\nStatus: ${this.result.status}\n${[...this.result.database.map((entry) => `${entry.environment}: database ${entry.status}`), ...this.result.administrators.map((entry) => `${entry.environment}: administrator ${entry.status}`), ...(this.result.details ? [JSON.stringify(this.result.details, null, 2)] : []), ...this.result.nextSteps].join("\n")}\n`
      );
    }
  }
}
