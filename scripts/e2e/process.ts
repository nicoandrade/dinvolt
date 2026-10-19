import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    if (child.pid && process.platform !== "win32") {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // The process may have exited between checking and signalling.
  }
  const force = setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      if (child.pid && process.platform !== "win32") {
        process.kill(-child.pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      // An already exited process needs no further cleanup.
    }
  }, 5000);
  force.unref();
  child.once("close", () => clearTimeout(force));
}

export function startProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
) {
  return spawn(command, args, {
    cwd,
    env,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

// Subprocesses may handle secrets. Capture stdout privately, discard stderr,
// and expose only the caller's fixed label when they fail or time out.
export async function execute(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    label: string;
    input?: unknown;
    timeout?: number;
    signal?: AbortSignal;
  }
): Promise<string> {
  options.signal?.throwIfAborted();
  const child = startProcess(command, args, options.cwd, options.env);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = (output + String(chunk)).slice(-1_048_576);
  });
  child.stderr.resume();
  child.stdin.on("error", () => {
    // Close reports failed input without echoing it.
  });
  child.stdin.end(
    options.input === undefined ? undefined : JSON.stringify(options.input)
  );
  const stop = () => stopProcess(child);
  options.signal?.addEventListener("abort", stop, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    stop();
  }, options.timeout ?? 600_000);
  // eslint-disable-next-line promise/avoid-new -- Adapt subprocess completion and private pipe handling.
  return await new Promise<string>((resolve, reject) => {
    child.once("error", () =>
      reject(new Error(`${options.label} could not start.`))
    );
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", stop);
      if (code === 0 && !signal && !timedOut && !options.signal?.aborted) {
        resolve(output);
      } else {
        reject(
          new Error(
            `${options.label} failed, timed out or was interrupted. Private diagnostics were suppressed.`
          )
        );
      }
    });
  });
}
