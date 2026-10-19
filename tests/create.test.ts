import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createNextProject,
  moveProjectEntry,
  prepareProject,
  projectNameError,
  runCreateNextApp,
} from "../src/create.ts";

const directories: string[] = [];

async function fixture() {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "dinvolt-create-"))
  );
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

test("using the current folder preserves its path with a different project name", async () => {
  const directory = await fixture();
  expect(await prepareProject(directory, "another-project", "current")).toEqual(
    {
      name: "another-project",
      path: directory,
    }
  );
  expect(await readdir(directory)).toEqual([]);
});

test("creates a child folder with the selected project name", async () => {
  const directory = await fixture();
  const project = await prepareProject(directory, "  my-app  ", "new");
  expect(project).toEqual({ name: "my-app", path: join(directory, "my-app") });
  expect((await stat(project.path)).isDirectory()).toBe(true);
  expect(await readdir(project.path)).toEqual([]);
});

test("refuses to reuse an existing destination", async () => {
  const directory = await fixture();
  await prepareProject(directory, "my-app", "new");
  await writeFile(join(directory, "my-app", "existing.txt"), "Keep this");
  await expect(prepareProject(directory, "my-app", "new")).rejects.toThrow(
    "already exists"
  );
  expect(
    await readFile(join(directory, "my-app", "existing.txt"), "utf-8")
  ).toBe("Keep this");
});

test("refuses file and symbolic link destinations", async () => {
  const directory = await fixture();
  const outside = await fixture();
  await writeFile(join(directory, "file"), "Keep this");
  await symlink(outside, join(directory, "link"), "dir");
  for (const name of ["file", "link"]) {
    await expect(prepareProject(directory, name, "new")).rejects.toThrow(
      "already exists"
    );
  }
  expect(await readdir(outside)).toEqual([]);
});

test("rejects empty names, paths, and reserved names before creating a folder", async () => {
  const directory = await fixture();
  for (const name of [
    "",
    "  ",
    ".",
    "..",
    "../outside",
    "nested/app",
    "nested\\app",
    "/tmp/app",
    "app\nname",
    "app.",
    "CON",
    "nul.txt",
    "My App",
    "my app",
    "aplicación",
    "node_modules",
    "favicon.ico",
    "a".repeat(215),
  ]) {
    expect(projectNameError(name)).toBeTypeOf("string");
    await expect(prepareProject(directory, name, "new")).rejects.toThrow();
  }
  expect(await readdir(directory)).toEqual([]);
});

test("rejects an occupied current folder before running the generator", async () => {
  const directory = await fixture();
  await writeFile(join(directory, "package.json"), "Keep this");
  let called = false;
  await expect(
    createNextProject(directory, "my-app", "current", async () => {
      called = true;
    })
  ).rejects.toThrow("existing files");
  expect(called).toBe(false);
  expect(await readFile(join(directory, "package.json"), "utf-8")).toBe(
    "Keep this"
  );
});

test.each(["current", "new"] as const)(
  "publishes a generated project in the %s folder with the chosen package name",
  async (location) => {
    const directory = await fixture();
    const project = await createNextProject(
      directory,
      "my-app",
      location,
      async (destination) => {
        // Like create-next-app, the generator derives its package name from its folder.
        await mkdir(destination);
        await writeFile(
          join(destination, "package.json"),
          JSON.stringify({ name: basename(destination) })
        );
        await mkdir(join(destination, "src", "app"), { recursive: true });
        await writeFile(
          join(destination, "src", "app", "page.tsx"),
          "export default function Page() { return null; }"
        );
      }
    );
    expect(project.path).toBe(
      location === "current" ? directory : join(directory, "my-app")
    );
    expect(
      JSON.parse(await readFile(join(project.path, "package.json"), "utf-8"))
        .name
    ).toBe("my-app");
    expect((await readdir(project.path)).toSorted()).toEqual([
      ".git",
      "package.json",
      "src",
    ]);
    expect(
      spawnSync("git", ["symbolic-ref", "--short", "HEAD"], {
        cwd: project.path,
        encoding: "utf-8",
      }).stdout.trim()
    ).toBe("main");
    expect(
      spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: project.path })
        .status
    ).not.toBe(0);
    expect(
      spawnSync("git", ["diff", "--cached", "--name-only"], {
        cwd: project.path,
        encoding: "utf-8",
      }).stdout
    ).toBe("");
  }
);

test.each(["current", "new"] as const)(
  "a failed generator cleans up its files in the %s folder",
  async (location) => {
    const directory = await fixture();
    await expect(
      createNextProject(directory, "my-app", location, async (destination) => {
        await mkdir(destination);
        await writeFile(
          join(destination, "package.json"),
          "Partial generation"
        );
        throw new Error("Dependency installation failed");
      })
    ).rejects.toThrow("Dependency installation failed");
    expect(await readdir(directory)).toEqual([]);
  }
);

test("preserves files added to the destination during generation", async () => {
  const directory = await fixture();
  await expect(
    createNextProject(directory, "my-app", "current", async (destination) => {
      await mkdir(destination);
      await writeFile(join(destination, "package.json"), "Generated");
      await writeFile(join(directory, "package.json"), "Concurrent edit");
    })
  ).rejects.toThrow("existing files");
  expect(await readdir(directory)).toEqual(["package.json"]);
  expect(await readFile(join(directory, "package.json"), "utf-8")).toBe(
    "Concurrent edit"
  );
});

test("creating in the current folder preserves an existing Git repository", async () => {
  const directory = await fixture();
  await mkdir(join(directory, ".git"));
  await writeFile(
    join(directory, ".git", "config"),
    "Existing Git configuration"
  );
  await createNextProject(
    directory,
    "my-app",
    "current",
    async (destination) => {
      await mkdir(destination);
      await writeFile(
        join(destination, "package.json"),
        JSON.stringify({ name: "my-app" })
      );
      await mkdir(join(destination, ".git"));
      await writeFile(
        join(destination, ".git", "config"),
        "Generated repository configuration"
      );
    }
  );
  expect(await readFile(join(directory, ".git", "config"), "utf-8")).toBe(
    "Existing Git configuration"
  );
  expect((await readdir(directory)).toSorted()).toEqual([
    ".git",
    "package.json",
  ]);
});

test("a project inside an ignored repository folder can lint both during generation and after publication", async () => {
  const directory = await fixture();
  const git = spawnSync("git", ["init", "--quiet", directory], {
    encoding: "utf-8",
  });
  expect(git.status, git.stderr).toBe(0);
  await writeFile(join(directory, ".gitignore"), "/projects/\n");
  const projects = join(directory, "projects");
  await mkdir(projects);
  const require = createRequire(import.meta.url);
  const oxlint = fileURLToPath(
    new URL("bin/oxlint", pathToFileURL(require.resolve("oxlint/package.json")))
  );
  const assertLintable = (cwd: string) => {
    const result = spawnSync("node", [oxlint, "--debug", "files"], {
      cwd,
      encoding: "utf-8",
      timeout: 10_000,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("src/app/page.tsx");
  };
  const project = await createNextProject(
    projects,
    "test-app",
    "new",
    async (destination) => {
      await runCreateNextApp(destination, "npm", true);
      assertLintable(destination);
    }
  );
  assertLintable(project.path);
  expect(await readFile(join(directory, ".gitignore"), "utf-8")).toBe(
    "/projects/\n"
  );
}, 15_000);

test("a transfer between volumes preserves relative dependency symlinks after temp cleanup", async () => {
  const directory = await fixture();
  const source = join(directory, "temporary", "node_modules");
  const target = join(directory, "node_modules");
  await mkdir(join(source, "package"), { recursive: true });
  await mkdir(join(source, ".bin"));
  await writeFile(join(source, "package", "tool.js"), "Installed executable");
  await symlink("../package/tool.js", join(source, ".bin", "tool"));
  await moveProjectEntry(source, target, async () => {
    throw Object.assign(new Error("Different volume"), { code: "EXDEV" });
  });
  await rm(join(directory, "temporary"), { recursive: true });
  expect(await readlink(join(target, ".bin", "tool"))).toBe(
    "../package/tool.js"
  );
  expect(await readFile(join(target, ".bin", "tool"), "utf-8")).toBe(
    "Installed executable"
  );
});

test("a transfer between volumes preserves private environment file permissions", async () => {
  const directory = await fixture();
  const source = join(directory, "private-env");
  const target = join(directory, ".env.local");
  await writeFile(source, "BETTER_AUTH_SECRET=test-only\n", { mode: 0o600 });
  await moveProjectEntry(source, target, async () => {
    throw Object.assign(new Error("Different volume"), { code: "EXDEV" });
  });
  if (process.platform !== "win32") {
    // eslint-disable-next-line no-bitwise -- Mask POSIX permission bits after a cross-volume transfer.
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  }
});
