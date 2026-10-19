import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import settings from "../catalog/trpc/config.json" with { type: "json" };
import { configureProject } from "../src/setup.ts";
import { prepareTRPCStarter } from "../src/trpc.ts";

const directories: string[] = [];
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-trpc-test-"));
  directories.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "demo-1",
      dependencies: { next: "16.4.2", "better-auth": "1.7.10" },
    })
  );
  await mkdir(join(root, "src/lib"), { recursive: true });
  await writeFile(
    join(root, "src/lib/auth.ts"),
    "// Existing Better Auth configuration\n"
  );
  for (const area of ["public", "admin"]) {
    const path = join(root, `src/app/(${area})`);
    await mkdir(path, { recursive: true });
    await writeFile(
      join(path, "layout.tsx"),
      (
        await readFile(
          new URL(`../catalog/ui/${area}-layout.tsx`, import.meta.url),
          "utf-8"
        )
      )
        .replaceAll("__PROJECT_NAME__", JSON.stringify("demo-1"))
        .replaceAll(
          "__DEVELOPMENT_URL__",
          JSON.stringify("https://demo-1.localhost")
        )
    );
  }
  await writeFile(join(root, "AGENTS.md"), "# Existing project instructions\n");
  return root;
};
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

test("prepares the modern tRPC integration in both root layouts, preserving themes and auth", async () => {
  const root = await fixture();
  const existing = JSON.parse(
    await readFile(join(root, "package.json"), "utf-8")
  );
  existing.dependencies["@trpc/client"] = "11.18.0";
  existing.dependencies.zod = "3.25.0";
  await writeFile(join(root, "package.json"), JSON.stringify(existing));
  await prepareTRPCStarter(root);
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf-8")
  );
  expect(manifest.dependencies).toMatchObject(settings.dependencies);
  expect(manifest.dependencies["@trpc/client"]).toBe(
    manifest.dependencies["@trpc/server"]
  );
  expect(manifest.dependencies["@trpc/tanstack-react-query"]).toBe(
    manifest.dependencies["@trpc/server"]
  );
  expect(manifest.dependencies["@trpc/react-query"]).toBeUndefined();
  for (const area of ["public", "admin"]) {
    const layout = await readFile(
      join(root, `src/app/(${area})/layout.tsx`),
      "utf-8"
    );
    expect(layout).toContain(
      "<TRPCReactProvider>{children}</TRPCReactProvider>"
    );
    expect(layout).toContain(`data-ui="${area}"`);
    if (area === "admin") {
      expect(layout).toContain('className="admin-panel"');
    }
  }
  expect(await readFile(join(root, "src/lib/auth.ts"), "utf-8")).toBe(
    "// Existing Better Auth configuration\n"
  );
  const instructions = await readFile(join(root, "AGENTS.md"), "utf-8");
  expect(instructions).toContain("# Existing project instructions");
  expect(instructions).toContain("<!-- BEGIN:dinvolt-trpc -->");
  expect(instructions).toContain(
    await readFile(
      new URL("../catalog/trpc/agent-instructions.md", import.meta.url),
      "utf-8"
    )
  );
  await configureProject(
    root,
    { packageManager: "bun", linter: "oxlint", editors: [], database: "turso" },
    "1.4.3",
    async () => {}
  );
  const config = JSON.parse(
    await readFile(join(root, ".dinvolt/config.json"), "utf-8")
  );
  expect(config.api).toEqual({
    provider: "trpc",
    version: manifest.dependencies["@trpc/server"],
    query: "tanstack-query",
    queryVersion: manifest.dependencies["@tanstack/react-query"],
  });
});

test("rejects conflicting API files before changing layouts or installing dependencies", async () => {
  const root = await fixture();
  const original = await readFile(join(root, "package.json"), "utf-8");
  await mkdir(join(root, "src/app/api/trpc/[trpc]"), { recursive: true });
  await writeFile(
    join(root, "src/app/api/trpc/[trpc]/route.ts"),
    "// Existing endpoint\n"
  );
  await expect(prepareTRPCStarter(root)).rejects.toThrow("would replace");
  expect(await readFile(join(root, "package.json"), "utf-8")).toBe(original);
  expect(await readdir(join(root, "src"))).not.toContain("trpc");
  expect(
    await readFile(join(root, "src/app/(admin)/layout.tsx"), "utf-8")
  ).not.toContain("TRPCReactProvider");
});

test("preserves customized layouts and refuses symlinked router paths", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "src/app/(public)/layout.tsx"),
    "// My public layout\n"
  );
  await expect(prepareTRPCStarter(root)).rejects.toThrow(
    "untouched public layout"
  );
  expect(await readdir(join(root, "src"))).not.toContain("trpc");
  const other = await fixture();
  await symlink(join(root, "src"), join(other, "src/trpc"));
  await expect(prepareTRPCStarter(other)).rejects.toThrow("symbolic link");
  expect(await readdir(join(root, "src"))).not.toContain("context.ts");
});
