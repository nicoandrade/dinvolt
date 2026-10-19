import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import settings from "../catalog/skills/config.json" with { type: "json" };
import { defaultDatabase } from "./database.ts";
import type { DatabaseProvider } from "./database.ts";
import { runCommand } from "./process.ts";
import { hasAdministration } from "./project-type.ts";
import type { ProjectType } from "./project-type.ts";

const require = createRequire(import.meta.url);

export interface SkillSource {
  source: string;
  skills: string[];
}

interface ProjectSkillsOptions {
  projectType?: ProjectType;
  database?: DatabaseProvider;
  skills?: boolean;
}

const catalog: {
  always: SkillSource[];
  admin: SkillSource[];
  database: Record<DatabaseProvider, SkillSource[]>;
} = settings;

// Explicit project targets keep installation independent of globally detected
// agents and editor preferences. Codex and Cursor share the universal directory.
export const skillTargets = [
  { agent: "universal", directory: ".agents/skills" },
  { agent: "claude-code", directory: ".claude/skills" },
] as const;

export function projectSkills(
  options: ProjectSkillsOptions = {}
): SkillSource[] {
  if (options.skills === false) {
    return [];
  }
  return [
    ...catalog.always,
    ...(hasAdministration(options.projectType)
      ? [
          ...catalog.admin,
          ...catalog.database[options.database ?? defaultDatabase],
        ]
      : []),
  ];
}

export async function installProjectSkills(
  directory: string,
  options: ProjectSkillsOptions = {},
  run = runCommand
) {
  const selected = projectSkills(options);
  if (!selected.length) {
    return;
  }
  const cli = require.resolve("skills/bin/cli.mjs");
  // Some upstream download paths skip agent links unless their folder exists.
  for (const target of skillTargets) {
    await mkdir(join(directory, target.directory), { recursive: true });
  }
  for (const { source, skills } of selected) {
    try {
      // Copy each target independently: upstream's shared symlink install can
      // report success while leaving the second agent directory incomplete.
      await run(
        process.execPath,
        [
          cli,
          "add",
          source,
          "--skill",
          ...skills,
          "--agent",
          ...skillTargets.map((target) => target.agent),
          "--copy",
          "--yes",
        ],
        { cwd: directory }
      );
      // The upstream CLI can exit successfully after only a partial install.
      // Check every target and the project lock before publishing the starter.
      const lock = JSON.parse(
        await readFile(join(directory, "skills-lock.json"), "utf-8")
      );
      for (const name of skills) {
        for (const target of skillTargets) {
          if (
            !(
              await readFile(
                join(directory, target.directory, name, "SKILL.md"),
                "utf-8"
              )
            ).trim()
          ) {
            throw new Error(`Empty SKILL.md for ${name} (${target.agent}).`);
          }
        }
        if (
          lock.skills?.[name]?.source !== source ||
          !lock.skills[name].computedHash
        ) {
          throw new Error(`Missing project lock entry for ${name}.`);
        }
      }
    } catch (error) {
      throw new Error(
        `Could not install project skills from ${source}: ${(error as Error).message}`,
        { cause: error }
      );
    }
  }
}
