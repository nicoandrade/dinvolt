import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { directoryRoot } from "./files.ts";
import { runCommand } from "./process.ts";
import type { PackageManager } from "./setup.ts";

const require = createRequire(import.meta.url);

const nextOptions = [
  "--ts",
  "--tailwind",
  "--cache-components",
  "--no-linter",
  "--app",
  "--src-dir",
  "--empty",
  "--yes",
  "--no-react-compiler",
  "--import-alias",
  "@/*",
  "--agents-md",
  "--no-agent-feedback",
  "--disable-git",
];

export function projectNameError(
  value: string | undefined
): string | undefined {
  const name = value?.trim();
  if (!name) {
    return "Enter a project name.";
  }
  if (
    name === "." ||
    name === ".." ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in directory names.
    /[<>:"/\\|?*\u0000-\u001F\u007F]/u.test(name) ||
    name.endsWith(".")
  ) {
    return "Use a folder name without path separators or special characters.";
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)) {
    return "This name is reserved. Choose another project name.";
  }
  if (
    name.length > 214 ||
    !/^[a-z0-9][a-z0-9._-]*$/u.test(name) ||
    ["node_modules", "favicon.ico"].includes(name)
  ) {
    return "Use a package name of up to 214 characters: lowercase letters, numbers, hyphens, underscores or dots, starting with a letter or number.";
  }
}

async function assertAvailable(directory: string) {
  const entries = (await readdir(directory)).filter(
    (name) => ![".git", ".DS_Store"].includes(name)
  );
  if (entries.length) {
    throw new Error(
      `The destination contains existing files: ${entries.join(", ")}. Use an empty folder or create a new one.`
    );
  }
}

export async function prepareProject(
  directory: string,
  projectName: string,
  location: "current" | "new"
) {
  const nameError = projectNameError(projectName);
  if (nameError) {
    throw new Error(nameError);
  }
  const name = projectName.trim();
  const root = await directoryRoot(directory);
  const path = location === "current" ? root : join(root, name);
  if (location === "new") {
    try {
      await mkdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(
          `The destination already exists: ${path}. Choose another name or use the current folder.`,
          { cause: error }
        );
      }
      throw error;
    }
  } else {
    await assertAvailable(path);
  }
  return { name, path };
}

export async function runCreateNextApp(
  destination: string,
  manager: PackageManager = "bun",
  skipInstall = false
) {
  const cli = require.resolve("create-next-app/dist/index.js");
  // Next's generator supports four managers directly. For the others it only
  // writes the template; Ultracite performs the installation with the chosen PM.
  const templateManager = ["bun", "npm", "pnpm", "yarn"].includes(manager)
    ? manager
    : "npm";
  await runCommand(process.execPath, [
    cli,
    destination,
    ...nextOptions,
    `--use-${templateManager}`,
    ...(skipInstall ? ["--skip-install"] : []),
  ]);
}

export async function moveProjectEntry(
  source: string,
  target: string,
  move = rename
) {
  try {
    await move(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    // System temp and the destination may be on different volumes. Preserve
    // relative package-manager symlinks instead of pointing into temp files.
    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
  }
}

export async function createNextProject(
  directory: string,
  name: string,
  location: "current" | "new",
  generate = runCreateNextApp,
  onDurable?: (project: { name: string; path: string }) => void
) {
  const project = await prepareProject(directory, name, location);
  let staging: string | undefined;
  try {
    // Work outside the destination's repository so its ignore rules cannot
    // exclude the whole starter. The basename still determines the package name.
    staging = await mkdtemp(join(tmpdir(), "dinvolt-create-"));
    const generated = join(staging, project.name);
    await generate(generated);
    await assertAvailable(project.path);
    // Keep an existing repository/worktree marker. Otherwise, the starter keeps
    // the independent repository create-next-app initialized in its temp folder.
    try {
      await lstat(join(project.path, ".git"));
      await rm(join(generated, ".git"), { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const entries = await readdir(generated);
    for (const entry of entries) {
      try {
        await lstat(join(project.path, entry));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw error;
      }
      throw new Error(
        `The destination already contains ${entry}. Existing files were preserved.`
      );
    }
    for (const entry of entries) {
      await moveProjectEntry(join(generated, entry), join(project.path, entry));
    }
    onDurable?.(project);
    // Initialize only after generation is durable. No automatic commit, staging,
    // branch rename, remote creation or push; preserve existing Git/worktrees.
    try {
      await lstat(join(project.path, ".git"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      try {
        await runCommand("git", [
          "init",
          "--initial-branch=main",
          project.path,
        ]);
      } catch {
        throw new Error(
          `Project created at ${project.path}, but Git initialization failed. Install/configure Git and run git init there yourself; files were preserved.`
        );
      }
    }
    return project;
  } finally {
    if (staging) {
      await rm(staging, { recursive: true, force: true });
    }
    // Remove only an empty directory created by this run, never existing data.
    if (location === "new") {
      try {
        await rmdir(project.path);
      } catch {
        /* Keep completed or concurrently modified projects. */
      }
    }
  }
}
