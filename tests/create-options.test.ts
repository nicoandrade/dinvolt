import { expect, test } from "bun:test";

import {
  CreateInputError,
  resolveCreateOptions,
} from "../src/create-options.ts";
import type { CreateOptions } from "../src/create-options.ts";
import { projectOptions } from "../src/project-prompts.ts";
import { defaultUIPresets } from "../src/ui-presets.ts";

const base = { cwd: ".", name: "agent-app", projectType: "public-admin" };

test.each(["public", "public-admin"] as const)(
  "noninteractive defaults match wizard defaults for %s",
  async (projectType) => {
    const wizard = await projectOptions("npm", {
      select: async (options) =>
        (options.initialValue === "public-admin"
          ? projectType
          : options.initialValue!) as NonNullable<typeof options.initialValue>,
      text: async (options) => options.defaultValue ?? "",
      multiselect: async (options) => options.initialValues ?? [],
      note: () => {},
    });
    const automated = resolveCreateOptions({ ...base, projectType }, "npm");
    expect(automated.setup).toEqual(wizard.setup);
    expect(automated.uiPresets).toEqual(wizard.uiPresets);
  }
);

test("advanced options preserve explicit choices and normalize lists and presets", () => {
  const result = resolveCreateOptions({
    ...base,
    location: "new",
    packageManager: "pnpm",
    linter: "biome",
    editors: "zed,universal,zed",
    publicPreset: "--preset b0",
    adminPreset: defaultUIPresets.admin,
    database: "planetscale-postgres",
    databaseEnvironments: "production,development,production",
    skills: false,
  });
  expect(result.setup).toEqual({
    projectType: "public-admin",
    packageManager: "pnpm",
    linter: "biome",
    editors: ["zed", "universal"],
    database: "planetscale-postgres",
    databaseEnvironments: ["development", "production"],
    skills: false,
  });
  expect(result.uiPresets.public).toBe("b0");
  expect(result.location).toBe("new");
  expect(
    resolveCreateOptions({ ...base, editors: "none" }).setup.editors
  ).toEqual([]);
});

test.each([
  { name: undefined },
  { name: "../unsafe" },
  { projectType: undefined },
  { location: "elsewhere" },
  { projectType: "public", database: "turso" },
  { projectType: "public", adminPreset: "b0" },
  { publicPreset: "invalid-preset" },
  { editors: "none,zed" },
  { databaseEnvironments: "" },
  { databaseEnvironments: "dev" },
  { connect: "development" },
  { credentialsFile: "/tmp/credentials.json" },
  { connect: "production", credentialsFile: "/tmp/credentials.json" },
  { adminName: "Admin" },
  { adminEnvironments: "development" },
  {
    connect: "development",
    credentialsFile: "/tmp/credentials.json",
    adminEnvironments: "development",
    adminName: "Admin",
    adminEmail: "invalid",
    adminOutput: "/tmp/private.jsonl",
  },
] satisfies Partial<CreateOptions>[])(
  "rejects invalid combinations before execution: %j",
  (overrides) => {
    expect(() => resolveCreateOptions({ ...base, ...overrides })).toThrow(
      CreateInputError
    );
  }
);
