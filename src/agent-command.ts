import { CommandOutput } from "./command-output.ts";
import type { AgentCommand } from "./command-output.ts";
import { CreateInputError } from "./create-options.ts";

export interface AgentOptions {
  cwd: string;
  input?: boolean;
  json?: boolean;
}
export function isNonInteractive(options: AgentOptions) {
  return (
    options.input === false ||
    options.json === true ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    ["true", "1"].includes(process.env.CI ?? "")
  );
}
export function requireWizardMode(options: AgentOptions) {
  if (
    Object.keys(options).some((key) => !["cwd", "input", "json"].includes(key))
  ) {
    throw new CreateInputError(
      "Include --no-input or --json when supplying setup choices, or omit choices to use the wizard.",
      "no-input"
    );
  }
}
let currentOutput: CommandOutput | undefined;
export const getAgentOutput = () => currentOutput;
export async function runAgentCommand(
  command: AgentCommand,
  options: AgentOptions,
  action: (output: CommandOutput) => Promise<void>
) {
  const output = new CommandOutput(true, options.json === true, command);
  currentOutput = output;
  const stop = () => {
    output.interrupted = true;
    process.exitCode = 130;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await action(output);
    output.checkInterrupted();
    output.finish();
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
