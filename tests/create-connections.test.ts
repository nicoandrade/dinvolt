import { afterEach, expect, test } from "bun:test";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAdministrators,
  createConnections,
  validateAdminOutput,
} from "../src/create-connections.ts";
import { resolveCreateOptions } from "../src/create-options.ts";
import { CreateOutput } from "../src/create-output.ts";

const directories: string[] = [];
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "dinvolt-agent-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});
const base = { cwd: ".", name: "agent-app", projectType: "public-admin" };

test("deferred connections never probe databases or inherit credentials", async () => {
  const selection = resolveCreateOptions({
    ...base,
    databaseEnvironments: "development,production",
  });
  const results = await createConnections(base, selection, async () => {
    throw new Error("must not probe");
  });
  expect(results).toEqual([
    { environment: "development" },
    { environment: "production" },
  ]);
});

test("credential file validates all selected environments before any probe and never echoes secret content", async () => {
  const directory = await fixture();
  const credentialsFile = join(directory, "credentials.json");
  const options = {
    ...base,
    databaseEnvironments: "development,production",
    connect: "development,production",
    credentialsFile,
  };
  const secret = "not-a-valid-url-secret";
  await writeFile(
    credentialsFile,
    JSON.stringify({
      TURSO_DATABASE_URL: "https://demo.turso.io",
      TURSO_AUTH_TOKEN: "private-token",
      TURSO_DATABASE_URL_PRODUCTION: secret,
    })
  );
  let probes = 0;
  try {
    await createConnections(
      options,
      resolveCreateOptions(options),
      async (): Promise<undefined> => {
        probes += 1;
      }
    );
    throw new Error("Expected validation failure");
  } catch (error) {
    expect(String(error)).toContain("TURSO_DATABASE_URL_PRODUCTION");
    expect(String(error)).not.toContain(secret);
  }
  expect(probes).toBe(0);
  await writeFile(credentialsFile, '{"secret": "do-not-echo');
  await expect(
    createConnections(options, resolveCreateOptions(options))
  ).rejects.toThrow("readable JSON object");
});

test("only explicitly selected environments receive exact suffixed credentials", async () => {
  const directory = await fixture();
  const credentialsFile = join(directory, "credentials.json");
  const options = {
    ...base,
    databaseEnvironments: "development,production",
    connect: "production",
    credentialsFile,
  };
  await writeFile(
    credentialsFile,
    JSON.stringify({
      TURSO_DATABASE_URL_PRODUCTION: "https://demo.turso.io",
      TURSO_AUTH_TOKEN_PRODUCTION: "private-token",
      UNRELATED: "ignored",
    })
  );
  const results = await createConnections(
    options,
    resolveCreateOptions(options),
    async (provider, credentials): Promise<undefined> => {
      expect(provider).toBe("turso");
      expect(credentials).toEqual({
        TURSO_DATABASE_URL: "https://demo.turso.io",
        TURSO_AUTH_TOKEN: "private-token",
      });
    }
  );
  expect(results[0]).toEqual({ environment: "development" });
  expect(results[1]?.credentials).toBeDefined();
});

test("admin output refuses existing files and paths inside the project, including symlinks", async () => {
  const directory = await fixture();
  await expect(
    validateAdminOutput(join(directory, "passwords.jsonl"), directory)
  ).rejects.toThrow("outside");
  const external = await fixture();
  await symlink(directory, join(external, "project"));
  await expect(
    validateAdminOutput(join(external, "project", "passwords.jsonl"), directory)
  ).rejects.toThrow("outside");
  const existing = join(external, "keep.jsonl");
  await writeFile(existing, "keep");
  await expect(validateAdminOutput(existing, directory)).rejects.toThrow(
    "new file"
  );
  expect(await readFile(existing, "utf-8")).toBe("keep");
});

test("administrator creation writes passwords only to an exclusive private file and preserves the result", async () => {
  const directory = await fixture();
  const options = {
    ...base,
    connect: "development",
    credentialsFile: "unused.json",
    adminEnvironments: "development",
    adminName: "Admin",
    adminEmail: "TEST@example.com",
    adminOutput: join(directory, "private.jsonl"),
  };
  const output = new CreateOutput(true, true);
  output.result.administrators = [
    { environment: "development", status: "pending" },
  ];
  const connections = [
    {
      environment: "development" as const,
      credentials: {
        TURSO_DATABASE_URL: "https://demo.turso.io",
        TURSO_AUTH_TOKEN: "private-token",
      },
    },
  ];
  await createAdministrators(
    directory,
    options,
    resolveCreateOptions(options),
    connections,
    [{ environment: "development", connected: true, status: "ready" }],
    output,
    async (_directory, _connection, identity) => {
      if (!identity) {
        return { status: "available" };
      }
      expect(identity).toEqual({ name: "Admin", email: "test@example.com" });
      return {
        status: "created",
        email: identity.email,
        password: "private-password",
      };
    },
    async () => true
  );
  // eslint-disable-next-line no-bitwise -- Verify owner-only POSIX permissions for generated passwords.
  expect((await stat(options.adminOutput)).mode & 0o777).toBe(0o600);
  expect(JSON.parse(await readFile(options.adminOutput, "utf-8"))).toEqual({
    environment: "development",
    email: "test@example.com",
    password: "private-password",
  });
  expect(output.result.administrators).toEqual([
    { environment: "development", status: "created", credentialsSaved: true },
  ]);
  expect(JSON.stringify(output.result)).not.toContain("private-password");
  await expect(
    createAdministrators(
      directory,
      options,
      resolveCreateOptions(options),
      connections,
      [],
      output
    )
  ).rejects.toThrow("EEXIST");
});
