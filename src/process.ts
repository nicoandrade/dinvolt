import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; stdio?: "capture" | "inherit" | "ignore" } = {}
) {
  return new Promise<void>((resolve, reject) => {
    const mode = options.stdio ?? "capture";
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: mode === "capture" ? ["ignore", "pipe", "pipe"] : mode,
      shell: false,
    });
    let output = "";
    let truncated = false;
    const capture = (chunk: string) => {
      output += chunk;
      if (output.length > 65_536) {
        output = output.slice(-65_536);
        truncated = true;
      }
    };
    child.stdout?.setEncoding("utf-8").on("data", capture);
    child.stderr?.setEncoding("utf-8").on("data", capture);
    const interrupt = () => {
      child.kill("SIGINT");
    };
    const terminate = () => {
      child.kill("SIGTERM");
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    child.once("error", (error) =>
      reject(new Error(`Could not run ${command}: ${error.message}`))
    );
    child.once("close", (code, signal) => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
      if (code === 0) {
        resolve();
      } else {
        const diagnostic = stripVTControlCharacters(output)
          .replaceAll(/\r\n?/gu, "\n")
          .trim();
        const summary = `${command} ${signal ? `was interrupted (${signal})` : `failed (exit code ${code})`}.`;
        reject(
          new Error(
            diagnostic
              ? `${summary}\n\n${truncated ? "Earlier output omitted.\n" : ""}${diagnostic}`
              : summary
          )
        );
      }
    });
  });
}
