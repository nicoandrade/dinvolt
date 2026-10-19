import { spawn } from "node:child_process";

import { CancelledError } from "./wizard-prompts.ts";

export const vercelVersion = "64.5.0";
export interface VercelCommand {
  args: string[];
  input?: string;
  interactive?: boolean;
}
export type VercelRunner = (command: VercelCommand) => Promise<string>;

// Provider diagnostics can echo a submitted value. Never forward them, including
// errors from npm, JSON parsing, or a command that failed after accepting a write.
export function vercelRunner(root: string): VercelRunner {
  return ({ args, input, interactive }) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      VERCEL_TELEMETRY_DISABLED: "1",
    };
    delete env.VERCEL_ORG_ID;
    delete env.VERCEL_PROJECT_ID;
    delete env.VERCEL_DEBUG;
    delete env.DEBUG;
    // eslint-disable-next-line promise/avoid-new -- Private stdin/stdout subprocess protocol.
    return new Promise((resolve, reject) => {
      const child = spawn(
        "npm",
        [
          "exec",
          "--yes",
          `--package=vercel@${vercelVersion}`,
          "--",
          "vercel",
          ...args,
          ...(interactive ? [] : ["--non-interactive"]),
          "--no-color",
        ],
        {
          cwd: root,
          env,
          shell: false,
          stdio: interactive ? "inherit" : ["pipe", "pipe", "pipe"],
        }
      );
      let output = "";
      const interrupt = () => child.kill("SIGINT");
      process.once("SIGINT", interrupt);
      const timer = interactive
        ? undefined
        : setTimeout(() => child.kill("SIGTERM"), 120_000);
      const cleanup = () => {
        clearTimeout(timer);
        process.removeListener("SIGINT", interrupt);
      };
      child.stdout?.on("data", (chunk) => {
        if (output.length < 8_000_000) {
          output += String(chunk);
        } else {
          child.kill();
        }
      });
      child.stderr?.resume();
      child.stdin?.on("error", () => {
        /* handled on close */
      });
      child.on("error", () => {
        cleanup();
        reject(
          new Error(
            "Could not start the pinned Vercel CLI. Install Node.js/npm and retry."
          )
        );
      });
      child.on("close", (code, signal) => {
        cleanup();
        if (signal === "SIGINT" || code === 130) {
          reject(new CancelledError());
        } else if (code === 0) {
          resolve(output);
        } else {
          reject(
            new Error(
              "Vercel did not confirm the operation. Check login, team permissions and Git provider app access in Vercel, then rerun dinvolt vercel setup. A write may have completed; existing resources will be inspected on retry. Provider output was withheld to protect secrets."
            )
          );
        }
      });
      child.stdin?.end(input);
    });
  };
}

export async function vercelJSON<T>(
  run: VercelRunner,
  command: VercelCommand
): Promise<T> {
  const output = await run(command);
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new Error(
      "Vercel returned an unreadable response. Rerun setup to inspect the current state; no provider output was displayed."
    );
  }
}

export function vercelAPI<T>(
  run: VercelRunner,
  path: string,
  team?: string,
  body?: unknown,
  method = "GET"
) {
  return vercelJSON<T>(run, {
    args: [
      "api",
      path,
      "--raw",
      ...(team ? ["--scope", team] : []),
      ...(body === undefined ? [] : ["--method", method, "--input", "-"]),
    ],
    ...(body === undefined ? {} : { input: JSON.stringify(body) }),
  });
}
