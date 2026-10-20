import { expect, test } from "bun:test";

import { CANCEL_SYMBOL } from "@clack/core";

import { projectOptions } from "../src/project-prompts.ts";
import type { ProjectType } from "../src/project-type.ts";
import { projectSkills } from "../src/skills.ts";
import { defaultUIPresets } from "../src/ui-presets.ts";
import { CancelledError } from "../src/wizard-prompts.ts";

type Prompts = NonNullable<Parameters<typeof projectOptions>[1]>;

function wizard(type?: ProjectType, advanced = false) {
  const questions: string[] = [];
  const notes: string[] = [];
  const prompts: Prompts = {
    select: async (options) => {
      questions.push(options.message);
      if (options.initialValue === "public-admin") {
        expect(options.options.map((option) => String(option.value))).toEqual([
          "public-admin",
          "public",
        ]);
        return (type ?? options.initialValue) as typeof options.initialValue;
      }
      if (options.initialValue === "defaults" && advanced) {
        return "advanced" as typeof options.initialValue;
      }
      return options.initialValue!;
    },
    multiselect: async (options) => {
      questions.push(options.message);
      return options.initialValues ?? [];
    },
    text: async (options) => {
      questions.push(options.message);
      return options.defaultValue ?? "";
    },
    note: (message) => {
      notes.push(message ?? "");
    },
  };
  return { prompts, questions, notes };
}

test("accepting wizard defaults preserves the public site and admin panel starter", async () => {
  const { prompts, questions } = wizard();
  const result = await projectOptions(undefined, prompts);
  expect(result.setup).toMatchObject({
    projectType: "public-admin",
    database: "turso",
    databaseEnvironments: ["development"],
    skills: true,
  });
  expect(result.uiPresets).toEqual(defaultUIPresets);
  expect(questions).toHaveLength(2);
});

test.each([false, true])(
  "public-only configuration (advanced: %s) never asks for admin presets or databases",
  async (advanced) => {
    const { prompts, questions, notes } = wizard("public", advanced);
    const result = await projectOptions("npm", prompts);
    expect(result.setup.projectType).toBe("public");
    expect(result.setup.packageManager).toBe("npm");
    expect(result.setup.database).toBeUndefined();
    expect(result.setup.databaseEnvironments).toBeUndefined();
    expect(result.uiPresets).toEqual({ public: defaultUIPresets.public });
    expect(questions.join("\n")).not.toMatch(/database|admin panel/iu);
    expect(notes.join("\n")).not.toContain("Admin panel:");
    expect(
      questions.filter((question) => question.includes("preset"))
    ).toHaveLength(advanced ? 1 : 0);
    const skills = projectSkills(result.setup).flatMap(
      (source) => source.skills
    );
    expect(skills).toContain("shadcn");
    expect(skills).toContain("vercel-react-best-practices");
    expect(skills.join(" ")).not.toMatch(/auth|turso|postgres/iu);
  }
);

test("advanced admin panel configuration retains both presets and database questions", async () => {
  const { prompts, questions } = wizard("public-admin", true);
  const result = await projectOptions(undefined, prompts);
  expect(result.uiPresets).toEqual(defaultUIPresets);
  expect(
    questions.filter((question) => question.includes("preset"))
  ).toHaveLength(2);
  expect(questions).toContain("Which database do you want to use?");
  expect(questions).toContain(
    "Which database environments do you want to configure?"
  );
});

test("cancelling the project type stops the wizard", async () => {
  const { prompts } = wizard();
  prompts.select = async () => CANCEL_SYMBOL;
  await expect(projectOptions(undefined, prompts)).rejects.toBeInstanceOf(
    CancelledError
  );
});
