import * as defaultPrompts from "@clack/prompts";

import { projectDefaults } from "./create-options.ts";
import {
  databases,
  databaseEnvironments,
  defaultDatabase,
} from "./database.ts";
import {
  defaultProjectType,
  hasAdministration,
  projectTypes,
  projectUITargets,
} from "./project-type.ts";
import { editors, linters, packageManagers } from "./setup.ts";
import type { Editor, PackageManager } from "./setup.ts";
import { defaultUIPresets, normalizeUIPreset } from "./ui-presets.ts";
import { answer } from "./wizard-prompts.ts";

export async function projectOptions(
  detected?: PackageManager,
  prompts: Pick<
    typeof defaultPrompts,
    "select" | "multiselect" | "text" | "note"
  > = defaultPrompts
) {
  const projectType = answer(
    await prompts.select({
      message: "What type of project do you want to create?",
      options: [...projectTypes],
      initialValue: defaultProjectType,
    })
  );
  const admin = hasAdministration(projectType);
  const targets = projectUITargets(projectType);
  const configuration = answer(
    await prompts.select({
      message: "How would you like to configure the project?",
      options: [
        {
          value: "defaults" as const,
          label: "Use Dinvolt defaults",
          hint: admin
            ? "Skip advanced choices; optional database connection setup follows"
            : "Skip advanced choices and use the public website defaults",
        },
        {
          value: "advanced" as const,
          label: "Advanced configuration",
          hint: admin
            ? "Choose package manager, linter, editors, UI presets, database and skills"
            : "Choose package manager, linter, editors, public UI preset and skills",
        },
      ],
      initialValue: "defaults" as const,
    })
  );
  const { setup, uiPresets } = projectDefaults(projectType, detected);
  if (configuration === "advanced") {
    setup.packageManager = answer(
      await prompts.select({
        message: "Which package manager do you want to use?",
        options: packageManagers.map((value) => ({
          value,
          label: value === "bun" ? "Bun" : value,
          hint: value === detected ? "Detected from the project" : undefined,
        })),
        initialValue: setup.packageManager,
      })
    );
    setup.linter = answer(
      await prompts.select({
        message: "Which linter do you want to use?",
        options: [...linters],
        initialValue: setup.linter,
      })
    );
    setup.editors = answer(
      await prompts.multiselect<Editor>({
        message: "Which editors do you want to configure?",
        options: [...editors],
        initialValues: setup.editors,
        required: false,
      })
    );
    prompts.note(
      `Customize the Dinvolt defaults:\n${targets.map((target) => `${target === "public" ? "Public website" : "Admin panel"}: https://ui.shadcn.com/create?preset=${defaultUIPresets[target]}`).join("\n")}\n\nPaste its code or --preset <code>. Leave empty to use the Dinvolt default.`,
      "shadcn/ui presets"
    );
    for (const target of targets) {
      const input = answer(
        await prompts.text({
          message: `Which shadcn/ui preset do you want for the ${target === "public" ? "public website" : "admin panel"}?`,
          placeholder: `Default: ${defaultUIPresets[target]}`,
          defaultValue: defaultUIPresets[target],
          validate: (value) => {
            try {
              normalizeUIPreset(value ?? "", defaultUIPresets[target]);
            } catch (error) {
              return (error as Error).message;
            }
          },
        })
      );
      uiPresets[target] = normalizeUIPreset(input, defaultUIPresets[target]);
    }
    if (admin) {
      setup.database = answer(
        await prompts.select({
          message: "Which database do you want to use?",
          options: [...databases],
          initialValue: defaultDatabase,
        })
      );
      setup.databaseEnvironments = answer(
        await prompts.multiselect({
          message: "Which database environments do you want to configure?",
          options: databaseEnvironments.map((value) => ({
            value,
            label: value,
          })),
          initialValues: ["development"],
          required: true,
        })
      );
    }
    setup.skills = answer(
      await prompts.select({
        message: "Install the recommended agent skills for this project?",
        initialValue: true,
        options: [
          { value: true, label: "Yes, install skills" },
          { value: false, label: "No, I will install them manually later" },
        ],
      })
    );
  }
  return { setup, uiPresets, projectType };
}
