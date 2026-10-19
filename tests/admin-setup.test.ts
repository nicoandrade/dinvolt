import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureFirstAdministrator,
  saveDevelopmentAdmin,
} from "../src/admin-setup.ts";
import type { AdminPrompts, AdminResult } from "../src/admin-setup.ts";
import type { DatabaseConnection } from "../src/database-connections.ts";
import type { DatabaseInitialization } from "../src/database-initialization.ts";

const connections: DatabaseConnection[] = [
  "development",
  "staging",
  "production",
].map((environment) => ({
  environment: environment as DatabaseConnection["environment"],
  credentials: { TURSO_AUTH_TOKEN: "test" },
}));
const ready: DatabaseInitialization[] = connections.map(({ environment }) => ({
  environment,
  connected: true,
  status: "ready",
}));
const created: AdminResult = {
  status: "created",
  email: "test@example.com",
  password: "abcDEF123_-X",
};
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-first-admin-"));
  await writeFile(join(directory, ".gitignore"), ".env.local\n");
  await writeFile(
    join(directory, ".env.local"),
    "BETTER_AUTH_SECRET=preserved\nDEV_ADMIN_USER=old\nDEV_ADMIN_USER=duplicate\n"
  );
  return directory;
};

test("wizard offers only connected ready environments, ignores injected selection and asks identity once", async () => {
  const directory = await fixture();
  try {
    let identities = 0;
    const calls: string[] = [];
    const reports: string[] = [];
    const prompts: AdminPrompts = {
      select: async (environments) => {
        expect(environments).toEqual(["development", "staging"]);
        return ["development", "staging", "production"];
      },
      identity: async () => {
        identities += 1;
        return { name: "Test", email: "test@example.com" };
      },
      report: (environment, result, saved) => {
        reports.push(`${environment}:${result.status}:${saved}`);
      },
      cancelled: () => {
        throw new Error("Unexpected cancellation");
      },
    };
    await configureFirstAdministrator(
      directory,
      connections,
      ready.map((entry) =>
        entry.environment === "production"
          ? { ...entry, status: "failed", connected: false }
          : entry
      ),
      prompts,
      async (_, connection, identity) => {
        calls.push(`${connection.environment}:${Boolean(identity)}`);
        return identity ? created : { status: "available" };
      }
    );
    expect(identities).toBe(1);
    expect(calls).toEqual([
      "development:false",
      "staging:false",
      "development:true",
      "staging:true",
    ]);
    expect(reports).toEqual([
      "development:created:true",
      "staging:created:false",
    ]);
    const content = await readFile(join(directory, ".env.local"), "utf-8");
    expect(content).toContain("BETTER_AUTH_SECRET=preserved");
    expect(content.match(/DEV_ADMIN_USER=/gu)).toHaveLength(1);
    expect(content).toContain("DEV_ADMIN_PASSWORD='abcDEF123_-X'");
    expect((await stat(join(directory, ".env.local"))).mode % 0o1000).toBe(
      0o600
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each(["skip", "cancel", "existing", "inspect-failed", "partial"])(
  "wizard preserves project and tables on %s",
  async (scenario) => {
    const directory = await fixture();
    try {
      let cancelled = 0;
      let identities = 0;
      let writes = 0;
      const reported: AdminResult[] = [];
      await configureFirstAdministrator(
        directory,
        connections,
        ready,
        {
          select: async () =>
            scenario === "skip" ? [] : ["development", "staging"],
          identity: async () => {
            identities += 1;
            if (scenario === "cancel") {
              throw new Error("cancel");
            }
            return { name: "Test", email: "test@example.com" };
          },
          report: (_, result) => {
            reported.push(result);
          },
          cancelled: () => {
            cancelled += 1;
          },
        },
        async (_, connection, identity) => {
          if (!identity) {
            return {
              status:
                scenario === "existing"
                  ? "existing"
                  : scenario === "inspect-failed"
                    ? "failed"
                    : "available",
            };
          }
          writes += 1;
          if (connection.environment === "staging") {
            throw new Error("private driver details");
          }
          return created;
        }
      );
      expect(writes).toBe(scenario === "partial" ? 2 : 0);
      expect(identities).toBe(["cancel", "partial"].includes(scenario) ? 1 : 0);
      expect(cancelled).toBe(scenario === "cancel" ? 1 : 0);
      expect(await readFile(join(directory, ".gitignore"), "utf-8")).toContain(
        ".env.local\n"
      );
      if (scenario === "partial") {
        expect(reported.map((entry) => entry.status)).toEqual([
          "created",
          "failed",
        ]);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test("only confirmed development creation may persist credentials", async () => {
  const directory = await fixture();
  try {
    const before = await readFile(join(directory, ".env.local"), "utf-8");
    for (const environment of ["staging", "production"] as const) {
      expect(await saveDevelopmentAdmin(directory, environment, created)).toBe(
        false
      );
    }
    for (const status of ["existing", "failed", "available"] as const) {
      expect(
        await saveDevelopmentAdmin(directory, "development", { status })
      ).toBe(false);
    }
    expect(await readFile(join(directory, ".env.local"), "utf-8")).toBe(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
