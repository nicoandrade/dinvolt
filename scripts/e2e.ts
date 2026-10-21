import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { initializeDatabaseConnection } from "../src/database-initialization.ts";
import { checkBrowser } from "./e2e/browser.ts";
import {
  localEnvironment,
  testCredentials,
  testIdentity,
  verifyCredentials,
} from "./e2e/config.ts";
import { databaseWorker } from "./e2e/database.ts";
import { execute, startProcess, stopProcess } from "./e2e/process.ts";

const repository = fileURLToPath(new URL("../", import.meta.url));

async function acquireLock(runs: string, run: string) {
  await mkdir(runs, { recursive: true });
  const file = join(runs, ".lock");
  const lock = await open(file, "wx", 0o600).catch(() => {
    throw new Error(
      "A local E2E run is active. If it was killed, check demos/e2e-runs/.lock and its PID before removing that lock."
    );
  });
  await lock.writeFile(JSON.stringify({ pid: process.pid, run }));
  return async () => {
    await lock.close();
    await rm(file, { force: true });
  };
}

async function cleanupRun(run: string) {
  testIdentity(run);
  const credentials = await testCredentials(
    join(repository, ".env.demo.local")
  );
  const runs = join(repository, "demos/e2e-runs");
  const directory = join(runs, run, "app");
  await readFile(join(directory, ".dinvolt/config.json"), "utf-8");
  const unlock = await acquireLock(runs, run);
  try {
    const env = {
      ...localEnvironment(process.env),
      ...credentials,
      NODE_ENV: "development",
      DINVOLT_DATABASE_ENV: "development",
    };
    const result = await databaseWorker(
      repository,
      directory,
      env,
      credentials,
      run,
      "cleanup"
    );
    if (!result.cleaned) {
      throw new Error("Cleanup not confirmed.");
    }
    const file = join(runs, run, "report.json");
    const report = await readFile(file, "utf-8")
      .then((raw) => JSON.parse(raw))
      .catch(() => ({
        run,
        status: "interrupted",
        accounts: testIdentity(run),
        results: [],
      }));
    await writeFile(
      file,
      `${JSON.stringify({ ...report, cleanup: "passed" }, null, 2)}\n`,
      { mode: 0o600 }
    );
    console.log(`PASS cleanup confirmed for ${run}.`);
  } finally {
    await unlock();
  }
}

async function freePort() {
  const server = createServer();
  // eslint-disable-next-line promise/avoid-new -- Obtain an available loopback port from Node's callback API.
  return await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local E2E port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function selectedProjectType() {
  const projectType =
    process.argv[2] === "--project-type"
      ? (process.argv[3] ?? "")
      : "public-admin";
  if (
    !["public-admin", "admin"].includes(projectType ?? "") ||
    (process.argv.length !== 2 &&
      !(process.argv.length === 4 && process.argv[2] === "--project-type"))
  ) {
    throw new Error(
      "Usage: bun run test:e2e [--project-type public-admin|admin] [--cleanup <run>] (local, on demand)."
    );
  }
  return projectType;
}

async function main() {
  if (process.argv.length === 4 && process.argv[2] === "--cleanup") {
    await cleanupRun(process.argv[3] ?? "");
    return;
  }
  const projectType = selectedProjectType();
  const credentials = await testCredentials(
    join(repository, ".env.demo.local")
  );
  const baseEnvironment = localEnvironment(process.env);
  const runs = join(repository, "demos/e2e-runs");
  const run = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const unlock = await acquireLock(runs, run);
  const output = join(runs, run);
  const directory = join(output, "app");
  const abort = new AbortController();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let server: ReturnType<typeof startProcess> | undefined;
  let databaseTouched = false;
  let failed = false;
  let cleanup = "not-needed";
  let database = "not-checked";
  let current = "preflight";
  const results: { name: string; status: string; durationMs: number }[] = [];
  const step = async (name: string, action: () => Promise<void>) => {
    current = name;
    console.log(`E2E ${name}…`);
    const started = Date.now();
    try {
      await action();
      results.push({
        name,
        status: "passed",
        durationMs: Date.now() - started,
      });
      console.log(`PASS ${name}`);
    } catch {
      results.push({
        name,
        status: "failed",
        durationMs: Date.now() - started,
      });
      throw new Error(`E2E failed at: ${name}.`);
    }
  };
  const stop = () => {
    abort.abort();
    if (server) {
      stopProcess(server);
    }
    void browser?.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await mkdir(output, { mode: 0o700 });
    const origin = `http://127.0.0.1:${await freePort()}`;
    const env = {
      ...baseEnvironment,
      ...credentials,
      NODE_ENV: "development",
      DINVOLT_DATABASE_ENV: "development",
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      BETTER_AUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
      DEV_ADMIN_USER: "",
      DEV_ADMIN_PASSWORD: "",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    };
    verifyCredentials(env, credentials);
    const worker = (operation: string) =>
      databaseWorker(
        repository,
        directory,
        env,
        credentials,
        run,
        operation,
        abort.signal
      );
    await step("Chromium available", async () => {
      browser = await chromium.launch();
    });
    await step("Build the local CLI and registry", async () => {
      await execute(process.execPath, ["run", "build"], {
        cwd: repository,
        env: baseEnvironment,
        label: "CLI build",
        signal: abort.signal,
      });
    });
    await step(
      "Generate a fresh Turso app with the compiled Node CLI",
      async () => {
        const raw = await execute(
          "node",
          [
            join(repository, "dist/cli.js"),
            "create",
            "--json",
            "--cwd",
            output,
            "--name",
            "app",
            "--location",
            "new",
            "--project-type",
            projectType,
            "--package-manager",
            "bun",
            "--linter",
            "oxlint",
            "--database",
            "turso",
            "--database-environments",
            "development",
            "--no-skills",
          ],
          {
            cwd: repository,
            env: baseEnvironment,
            label: "Project generation",
            signal: abort.signal,
          }
        );
        const result = JSON.parse(raw);
        if (
          !["completed", "needs-attention"].includes(result.status) ||
          ![
            "scaffold",
            "dependencies",
            "components",
            "migration",
            "checks",
          ].every((id) => result.completedSteps?.includes(id)) ||
          result.database?.some(
            (entry: { status: string }) =>
              entry.status !== "credentials-pending"
          )
        ) {
          throw new Error("Project generation did not complete.");
        }
        // Read generated guidance before any remote operation; retained for inspection.
        for (const file of ["AGENTS.md", "docs/database.md", "docs/auth.md"]) {
          await readFile(join(directory, file), "utf-8");
        }
      }
    );
    await step(
      "Install additional UI without replacing existing components",
      async () => {
        const area =
          projectType === "admin"
            ? "src/components/ui"
            : "src/components/admin/ui";
        const button = await readFile(
          join(directory, area, "button.tsx"),
          "utf-8"
        );
        const profile = await readFile(
          join(directory, "components.json"),
          "utf-8"
        );
        for (const component of ["dialog", "@dinvolt/admin-panel"]) {
          const result = JSON.parse(
            await execute(
              "node",
              [
                join(repository, "dist/cli.js"),
                "ui",
                "add",
                component,
                "--cwd",
                directory,
                "--json",
              ],
              {
                cwd: repository,
                env: baseEnvironment,
                label: "Additional UI installation",
                signal: abort.signal,
              }
            )
          );
          if (result.status !== "completed") {
            throw new Error("Additional UI installation failed.");
          }
        }
        if (
          !(
            await readFile(join(directory, area, "dialog.tsx"), "utf-8")
          ).includes("Dialog")
        ) {
          throw new Error("The requested component was not installed.");
        }
        if (
          (await readFile(join(directory, area, "button.tsx"), "utf-8")) !==
            button ||
          (await readFile(join(directory, "components.json"), "utf-8")) !==
            profile
        ) {
          throw new Error(
            "An existing component or root profile was replaced."
          );
        }
      }
    );
    await step(
      "Build the generated app for production without database credentials",
      async () => {
        await execute("bun", ["run", "build"], {
          cwd: directory,
          env: baseEnvironment,
          label: "Generated production build",
          signal: abort.signal,
        });
      }
    );
    await step(
      "Verify effective credentials, shared schema and migration history",
      async () => {
        const { state } = await worker("inspect");
        if (state === "empty") {
          databaseTouched = true;
          const result = await initializeDatabaseConnection(directory, {
            environment: "development",
            credentials,
          });
          if (result.status !== "initialized") {
            throw new Error("Initial migration did not complete.");
          }
          console.log(
            "Initial migration applied to the empty internal test database; schema will be retained."
          );
          database = "initialized";
        } else if (state === "ready") {
          console.log(
            "Matching initial SQL and auth schema already applied; shared migration history preserved."
          );
          database = "reused";
        } else {
          throw new Error(
            "Shared schema requires review before E2E can write."
          );
        }
      }
    );
    let password = "";
    await step(
      "Create an isolated administrator with generated auth tooling",
      async () => {
        // Cleanup also covers a partially completed auth write.
        databaseTouched = true;
        const administrator = await worker("admin");
        if (
          administrator.email !== testIdentity(run).adminEmail ||
          !administrator.password
        ) {
          throw new Error("Administrator setup failed.");
        }
        ({ password } = administrator);
      }
    );
    await step("Start the generated application on loopback", async () => {
      const require = createRequire(join(directory, "package.json"));
      server = startProcess(
        "node",
        [
          require.resolve("next/dist/bin/next"),
          "dev",
          "--hostname",
          "127.0.0.1",
          "--port",
          new URL(origin).port,
        ],
        directory,
        env
      );
      let startupError = false;
      server.on("error", () => {
        startupError = true;
      });
      server.stdin.end();
      server.stdout.resume();
      server.stderr.resume();
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        abort.signal.throwIfAborted();
        if (
          startupError ||
          server.exitCode !== null ||
          server.signalCode !== null
        ) {
          throw new Error("Generated server exited.");
        }
        try {
          const response = await fetch(
            `${origin}${projectType === "admin" ? "/" : "/admin"}`,
            {
              signal: AbortSignal.timeout(5000),
            }
          );
          if (
            response.ok &&
            (await response.text()).includes("Admin sign in")
          ) {
            return;
          }
        } catch {
          /* Compilation can outlast the first readiness probe. */
        }
        await delay(500, undefined, { signal: abort.signal });
      }
      throw new Error("Generated server readiness timed out.");
    });
    if (!browser) {
      throw new Error("Chromium unavailable.");
    }
    await checkBrowser(
      browser,
      origin,
      run,
      password,
      randomBytes(18).toString("base64url"),
      async () => {
        await worker("persisted");
      },
      step,
      projectType === "admin"
    );
    await step("Denied user creation did not persist an account", async () => {
      await worker("denied");
    });
  } catch {
    failed = true;
    console.error(
      `FAIL ${current}. Private subprocess/browser diagnostics are suppressed.`
    );
  } finally {
    try {
      await browser?.close().catch(() => {
        failed = true;
      });
      if (server) {
        stopProcess(server);
      }
      if (databaseTouched) {
        cleanup = "failed";
        await step(
          "Remove and verify only this run's accounts and sessions",
          async () => {
            // Rebuild the explicit environment for cleanup after interruption too.
            const env = {
              ...baseEnvironment,
              ...credentials,
              NODE_ENV: "development",
              DINVOLT_DATABASE_ENV: "development",
            };
            const result = await databaseWorker(
              repository,
              directory,
              env,
              credentials,
              run,
              "cleanup"
            );
            if (!result.cleaned) {
              throw new Error("E2E cleanup was not confirmed.");
            }
          }
        );
        cleanup = "passed";
      }
    } catch {
      failed = true;
      console.error(
        `FAIL cleanup. Inspect run ${run}; its exact account emails are in report.json. Retry cleanup before discarding the demo.`
      );
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      await writeFile(
        join(output, "report.json"),
        `${JSON.stringify({ run, projectType, status: failed || abort.signal.aborted ? "failed" : "passed", database, cleanup, accounts: testIdentity(run), results }, null, 2)}\n`,
        { mode: 0o600 }
      ).catch(() => {
        failed = true;
      });
      await unlock();
    }
  }
  console.log(`Local E2E report: ${join(output, "report.json")}`);
  if (failed || abort.signal.aborted) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Local E2E could not start."
  );
  process.exitCode = 1;
}
