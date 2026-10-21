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
import { dirname, join } from "node:path";

import { resolveConfigPaths } from "@shadcn/registry/internal/get-config";
import { updateFiles } from "@shadcn/registry/internal/updaters/update-files";

import registry from "../catalog/registry/registry.json" with { type: "json" };
import { loadRegistryBlock } from "../src/registry.ts";
import { addUIComponents, defaultAdminBlocks } from "../src/ui.ts";

const directories: string[] = [];
const block = await loadRegistryBlock("@dinvolt/admin-panel", "admin");
const item = JSON.parse(await readFile(block.path, "utf-8"));
const put = async (root: string, path: string, content: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-registry-"));
  directories.push(root);
  await put(
    root,
    "package.json",
    JSON.stringify({
      dependencies: {
        next: "16.4.2",
        "better-auth": "1.7.10",
        "@tanstack/react-query": "5.104.3",
      },
    })
  );
  await put(root, "src/lib/auth.ts", "export const getAuth = () => {};");
  await put(
    root,
    "src/lib/dev-admin.ts",
    'export const developmentAdminDefaults = () => ({ email: "", password: "" });'
  );
  await put(
    root,
    "src/db/environment.ts",
    'export const getDatabaseEnvironment = () => "development";'
  );
  await put(
    root,
    "src/components/logo-iso.tsx",
    "export const LogoIso = () => null;"
  );
  await put(root, "src/lib/auth-client.ts", "export const authClient = {};");
  await put(
    root,
    "src/lib/table-query.ts",
    "export const tableQuerySchema = {};"
  );
  await put(
    root,
    "src/lib/users-query.ts",
    "export const usersQuerySchema = {}; export const usersExportQuerySchema = {};"
  );
  await put(
    root,
    "src/lib/csv.ts",
    "export const createCsvResponse = () => {};"
  );
  await put(
    root,
    "src/trpc/routers/users-data.ts",
    "export const usersSelection = {};"
  );
  await put(
    root,
    "src/trpc/routers/app.ts",
    "// users: adminUsers, user: adminUser"
  );
  await put(
    root,
    "src/lib/auth-config.ts",
    "export const options = { logger: authLogger, sendResetPassword };"
  );
  await put(root, "src/lib/auth-logger.ts", "export const authLogger = {};");
  await put(
    root,
    "src/trpc/query-client.ts",
    "export const resetQueryCache = async () => {};"
  );
  await put(
    root,
    "src/app/(admin)/layout.tsx",
    '<html className="admin-panel" />'
  );
  for (const area of ["admin", "public"]) {
    await put(
      root,
      `.dinvolt/ui/${area}.json`,
      await readFile(
        new URL(`../catalog/ui/${area}.json`, import.meta.url),
        "utf-8"
      )
    );
  }
  await put(
    root,
    ".dinvolt/ui/config.json",
    '{"schemaVersion":1,"custom":"preserve"}\n'
  );
  await put(
    root,
    "src/app/globals.css",
    await readFile(
      new URL("../catalog/ui/globals.css", import.meta.url),
      "utf-8"
    )
  );
  await put(root, "components.json", '{ "original": true }\n');
  return root;
};
const fakeInstall = async (root: string) => {
  for (const file of item.files) {
    await put(root, file.target.slice(2), file.content);
  }
};
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

test("the built registry carries current editable sources and the required consumer dependencies", async () => {
  for (const file of item.files) {
    expect(file.content).toBe(
      await readFile(
        new URL(`../catalog/registry/${file.path}`, import.meta.url),
        "utf-8"
      )
    );
  }
  const source = registry.items.find((entry) => entry.name === block.name)!;
  expect(item.dependencies).toEqual(source.dependencies);
  expect(
    item.dependencies.map((dependency: string) =>
      dependency.slice(0, dependency.lastIndexOf("@"))
    )
  ).toEqual(
    expect.arrayContaining([
      "react-hook-form",
      "@hookform/resolvers",
      "zod",
      "@tanstack/react-table",
    ])
  );
  expect(block.version).toBe(source.meta.dinvolt.version);
  expect(block.files).toContain("src/lib/admin-auth.ts");
  expect(block.files).toContain("docs/licenses/shadcn-admin-login.txt");
  expect(
    item.files
      .filter((file: { type: string }) => file.type === "registry:page")
      .map((file: { target: string }) => file.target)
      .toSorted()
  ).toEqual([
    "~/src/app/(admin)/admin/(auth)/forgot-password/page.tsx",
    "~/src/app/(admin)/admin/(auth)/page.tsx",
    "~/src/app/(admin)/admin/(auth)/reset-password/page.tsx",
    "~/src/app/(admin)/admin/(protected)/home/page.tsx",
    "~/src/app/(admin)/admin/(protected)/settings/page.tsx",
    "~/src/app/(admin)/admin/(protected)/settings/preferences/page.tsx",
    "~/src/app/(admin)/admin/(protected)/users/[userId]/page.tsx",
    "~/src/app/(admin)/admin/(protected)/users/page.tsx",
  ]);
});

test("binary login assets install byte-for-byte and preserve customization", async () => {
  const root = await fixture();
  const asset = "src/components/admin/login-background.jpg";
  const source = await readFile(
    new URL(
      "../catalog/registry/admin-panel/auth/login-background.jpg",
      import.meta.url
    )
  );
  expect(block.files).toContain(asset);
  expect(source.subarray(0, 3).toString("hex")).toBe("ffd8ff");
  await addUIComponents(root, [block.address], {}, fakeInstall);
  expect(await readFile(join(root, asset))).toEqual(source);
  await addUIComponents(root, [block.address], {}, async () => {
    throw new Error("Unchanged assets must not reinstall.");
  });
  const customized = Buffer.from(source);
  customized[100] = (customized[100]! + 1) % 256;
  await writeFile(join(root, asset), customized);
  await expect(
    addUIComponents(root, [block.address], { overwrite: true }, fakeInstall)
  ).rejects.toThrow("--overwrite does not replace");
  expect(await readFile(join(root, asset))).toEqual(customized);
});

test("the legacy login address resolves to the same panel and installation identity", async () => {
  expect(await loadRegistryBlock("@dinvolt/admin-login", "admin")).toEqual(
    block
  );
  expect(defaultAdminBlocks as readonly string[]).toContain(block.address);
  expect(defaultAdminBlocks as readonly string[]).not.toContain(
    "@dinvolt/admin-login"
  );
  await expect(
    loadRegistryBlock("@dinvolt/admin-login", "public")
  ).rejects.toThrow("requires --target admin");
  const root = await fixture();
  let installs = 0;
  const install = async (directory: string) => {
    installs += 1;
    await fakeInstall(directory);
  };
  await addUIComponents(root, ["@dinvolt/admin-login"], {}, install);
  await addUIComponents(root, [block.address], {}, install);
  expect(installs).toBe(1);
  const settings = JSON.parse(
    await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8")
  );
  expect(Object.keys(settings.blocks)).toEqual(["admin-panel"]);
});

test.each(["unchanged", "customized", "incomplete", "older-version"])(
  "legacy panel receipts preserve %s application files",
  async (state) => {
    const root = await fixture();
    await addUIComponents(root, [block.address], {}, fakeInstall);
    const path = join(root, ".dinvolt/ui/config.json");
    const settings = JSON.parse(await readFile(path, "utf-8"));
    settings.blocks["admin-login"] = settings.blocks[block.name];
    delete settings.blocks["admin-panel"];
    if (state === "older-version") {
      settings.blocks["admin-login"].version = "1.0.0";
    }
    const source = `${JSON.stringify(settings, null, 2)}\n`;
    await writeFile(path, source);
    const file = join(root, "src/components/admin/login-form.tsx");
    if (state === "customized") {
      await writeFile(file, "// existing customization\n");
    }
    if (state === "incomplete") {
      await rm(file);
    }
    const content = await readFile(file, "utf-8").catch(() => null);
    let installs = 0;
    const install = async () => {
      installs += 1;
    };
    for (const address of [block.address, "@dinvolt/admin-login"]) {
      const attempt = addUIComponents(
        root,
        [address],
        { overwrite: true },
        install
      );
      if (state === "unchanged") {
        await attempt;
      } else {
        await expect(attempt).rejects.toThrow(/customized|replace/u);
      }
    }
    expect(installs).toBe(0);
    expect(await readFile(path, "utf-8")).toBe(source);
    expect(await readFile(file, "utf-8").catch(() => null)).toBe(content);
  }
);

test("the default admin spinner installs independently, repeats safely and protects customization", async () => {
  const root = await fixture();
  const spinner = await loadRegistryBlock("@dinvolt/admin-spinner", "admin");
  const payload = JSON.parse(await readFile(spinner.path, "utf-8"));
  expect(defaultAdminBlocks as readonly string[]).toContain(spinner.address);
  expect(spinner.files).toContain("src/components/admin/ui/spinner.tsx");
  expect(
    spinner.files.some((path) => path.startsWith("src/components/ui/"))
  ).toBe(false);
  for (const file of payload.files) {
    expect(file.content).toBe(
      await readFile(
        new URL(`../catalog/registry/${file.path}`, import.meta.url),
        "utf-8"
      )
    );
  }
  // This UI primitive needs no authentication or admin route setup.
  await rm(join(root, "src/lib/auth.ts"));
  let calls = 0;
  const install = async (cwd: string) => {
    calls += 1;
    for (const file of payload.files) {
      await put(cwd, file.target.slice(2), file.content);
    }
  };
  await addUIComponents(root, [spinner.address], {}, install);
  await addUIComponents(root, [spinner.address], {}, install);
  expect(calls).toBe(1);
  await put(
    root,
    "src/components/admin/ui/spinner.tsx",
    "// customized spinner\n"
  );
  await expect(
    addUIComponents(root, [spinner.address], { overwrite: true }, install)
  ).rejects.toThrow("--overwrite does not replace");
  expect(calls).toBe(1);
  expect(
    await readFile(join(root, "src/components/admin/ui/spinner.tsx"), "utf-8")
  ).toBe("// customized spinner\n");
  await expect(loadRegistryBlock(spinner.address, "public")).rejects.toThrow(
    "requires --target admin"
  );
});

test("installs the local block with the admin profile, records its files and repeats as a no-op", async () => {
  const root = await fixture();
  const originalConfig = await readFile(join(root, "components.json"), "utf-8");
  const originalCss = await readFile(
    join(root, "src/app/globals.css"),
    "utf-8"
  );
  let calls = 0;
  const install = async (cwd: string, args: string[]) => {
    calls += 1;
    expect(args).toEqual([
      "add",
      join(cwd, ".dinvolt/ui/.lock/catalog.json"),
      "--yes",
    ]);
    const payload = JSON.parse(await readFile(args[1]!, "utf-8"));
    expect(
      payload.files.some(
        (file: { path: string }) => file.path === "ui/button.tsx"
      )
    ).toBe(true);
    expect(payload.registryDependencies).toEqual([]);
    const profile = JSON.parse(
      await readFile(join(cwd, "components.json"), "utf-8")
    );
    expect(profile.aliases.ui).toBe("@/components/admin/ui");
    await fakeInstall(cwd);
  };
  await addUIComponents(root, [block.address], {}, install);
  await addUIComponents(root, [block.address], {}, install);
  expect(calls).toBe(1);
  const settings = JSON.parse(
    await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8")
  );
  expect(settings.custom).toBe("preserve");
  expect(settings.blocks[block.name].version).toBe(block.version);
  expect(Object.keys(settings.blocks[block.name].files).toSorted()).toEqual(
    [...block.files].toSorted()
  );
  expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
    originalConfig
  );
  expect(await readFile(join(root, "src/app/globals.css"), "utf-8")).toBe(
    originalCss
  );
  expect(await readdir(join(root, ".dinvolt/ui"))).not.toContain(".lock");
});

test("rejects custom application files even with overwrite and preserves the recorded receipt", async () => {
  const root = await fixture();
  await addUIComponents(root, [block.address], {}, fakeInstall);
  const settings = await readFile(
    join(root, ".dinvolt/ui/config.json"),
    "utf-8"
  );
  await put(
    root,
    "src/components/admin/login-form.tsx",
    "// customized login\n"
  );
  await expect(
    addUIComponents(root, [block.address], { overwrite: true }, async () => {
      throw new Error("must not execute");
    })
  ).rejects.toThrow("--overwrite does not replace");
  expect(
    await readFile(join(root, "src/components/admin/login-form.tsx"), "utf-8")
  ).toBe("// customized login\n");
  expect(await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8")).toBe(
    settings
  );
});

test("rejects missing requirements, incompatible routes and symlinked destinations before installing", async () => {
  for (const situation of [
    "auth",
    "dev-admin",
    "database-environment",
    "logger",
    "route",
    "legacy-route",
    "symlink",
  ]) {
    const root = await fixture();
    if (situation === "auth") {
      await rm(join(root, "src/lib/auth.ts"));
    }
    if (situation === "dev-admin") {
      await rm(join(root, "src/lib/dev-admin.ts"));
    }
    if (situation === "database-environment") {
      await rm(join(root, "src/db/environment.ts"));
    }
    if (situation === "logger") {
      await rm(join(root, "src/lib/auth-logger.ts"));
    }
    if (situation === "route") {
      await put(
        root,
        "src/app/(admin)/admin/page.tsx",
        "// custom existing admin"
      );
    }
    if (situation === "legacy-route") {
      await put(
        root,
        "src/app/(admin)/admin/(auth)/login/page.tsx",
        "// existing login requires an explicit migration"
      );
    }
    if (situation === "symlink") {
      await symlink(
        join(root, "src/lib/auth.ts"),
        join(root, "src/lib/admin-auth.ts")
      );
    }
    let calls = 0;
    await expect(
      addUIComponents(root, [block.address], {}, async () => {
        calls += 1;
      })
    ).rejects.toThrow();
    expect(calls).toBe(0);
    expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
      '{ "original": true }\n'
    );
    expect(
      JSON.parse(await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8"))
        .blocks
    ).toBeUndefined();
  }
});

test("rejects unknown blocks, wrong targets, mixed installs and user-provided file paths", async () => {
  const root = await fixture();
  let calls = 0;
  const execute = async () => {
    calls += 1;
  };
  await expect(
    addUIComponents(root, ["@dinvolt/unknown"], {}, execute)
  ).rejects.toThrow("Unknown Dinvolt");
  await expect(
    addUIComponents(root, [block.address], { target: "public" }, execute)
  ).rejects.toThrow("--target admin");
  await expect(
    addUIComponents(root, [block.address, "button"], {}, execute)
  ).rejects.toThrow("one Dinvolt block");
  await expect(
    addUIComponents(root, ["/tmp/block.json"], {}, execute)
  ).rejects.toThrow("component names");
  expect(calls).toBe(0);
});

test("upstream failures and missing output never mark the block installed and always restore config", async () => {
  for (const mode of ["throw", "missing"]) {
    const root = await fixture();
    await expect(
      addUIComponents(root, [block.address], {}, async () => {
        if (mode === "throw") {
          throw new Error("Upstream failed");
        }
      })
    ).rejects.toThrow();
    expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
      '{ "original": true }\n'
    );
    expect(await readdir(join(root, ".dinvolt/ui"))).not.toContain(".lock");
    expect(
      JSON.parse(await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8"))
        .blocks
    ).toBeUndefined();
  }
});

test("preserves a concurrent edit of the receipt configuration", async () => {
  const root = await fixture();
  const changed = '{"userEdit":true}\n';
  await expect(
    addUIComponents(root, [block.address], {}, async (cwd) => {
      await fakeInstall(cwd);
      await put(root, ".dinvolt/ui/config.json", changed);
    })
  ).rejects.toThrow("configuration changed");
  expect(await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8")).toBe(
    changed
  );
});

test("does not mark a block installed when restoring the root profile fails", async () => {
  const root = await fixture();
  await put(root, "outside.json", "preserve me");
  await expect(
    addUIComponents(root, [block.address], {}, async (cwd) => {
      await fakeInstall(cwd);
      await rm(join(root, "components.json"));
      await symlink(join(root, "outside.json"), join(root, "components.json"));
    })
  ).rejects.toThrow("symbolic link");
  expect(await readFile(join(root, "outside.json"), "utf-8")).toBe(
    "preserve me"
  );
  expect(
    JSON.parse(await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8"))
      .blocks
  ).toBeUndefined();
  expect(
    await readFile(join(root, ".dinvolt/ui/.lock/components.json"), "utf-8")
  ).toBe('{ "original": true }\n');
});

test("public actions install without auth, stay in the public profile and protect customizations", async () => {
  const root = await fixture();
  await put(
    root,
    "package.json",
    JSON.stringify({ dependencies: { next: "16.4.2" } })
  );
  const publicBlock = await loadRegistryBlock(
    "@dinvolt/public-actions",
    "public"
  );
  const publicItem = JSON.parse(await readFile(publicBlock.path, "utf-8"));
  expect(publicItem.registryDependencies).toEqual(["button", "spinner"]);
  expect(
    publicBlock.files.every(
      (path) =>
        (path.startsWith("src/components/") && !path.includes("/admin/")) ||
        path === "docs/licenses/dinvolt-public-actions.txt"
    )
  ).toBe(true);
  let installs = 0;
  const install = async (directory: string, args: string[]) => {
    installs += 1;
    const profile = JSON.parse(
      await readFile(join(directory, "components.json"), "utf-8")
    );
    expect(profile.aliases.ui).toBe("@/components/ui");
    const payload = JSON.parse(await readFile(args[1]!, "utf-8"));
    expect(
      payload.files.some(
        (file: { path: string }) => file.path === "ui/button.tsx"
      )
    ).toBe(true);
    expect(
      payload.files.some(
        (file: { path: string }) => file.path === "ui/spinner.tsx"
      )
    ).toBe(true);
    for (const file of publicItem.files) {
      await put(directory, file.target.slice(2), file.content);
    }
  };
  const css = await readFile(join(root, "src/app/globals.css"), "utf-8");
  await addUIComponents(
    root,
    [publicBlock.address],
    { target: "public" },
    install
  );
  expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
    '{ "original": true }\n'
  );
  expect(await readFile(join(root, "src/app/globals.css"), "utf-8")).toBe(css);
  await addUIComponents(
    root,
    [publicBlock.address],
    { target: "public" },
    install
  );
  expect(installs).toBe(1);
  await put(root, "src/components/ui/action-button.tsx", "// customized");
  await expect(
    addUIComponents(
      root,
      [publicBlock.address],
      { target: "public", overwrite: true },
      install
    )
  ).rejects.toThrow("customized");
  await expect(loadRegistryBlock(publicBlock.address, "admin")).rejects.toThrow(
    "requires --target public"
  );
});

test.each(["admin", "public"] as const)(
  "both areas share icon files and imports when %s is installed first",
  async (first) => {
    const root = await fixture();
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } })
    );
    let installs = 0;
    const install = async (directory: string, args: string[]) => {
      installs += 1;
      const profile = JSON.parse(
        await readFile(join(directory, "components.json"), "utf-8")
      );
      const payload = JSON.parse(await readFile(args[1]!, "utf-8"));
      // Exercise shadcn's real target/import transformations, without installing
      // dependencies or contacting a database.
      await updateFiles(
        payload.files,
        await resolveConfigPaths(directory, profile),
        { plannedFiles: payload.files, silent: true, interactive: false }
      );
    };
    const order = first === "admin" ? ["admin", "public"] : ["public", "admin"];
    const iconNotice = await readFile(
      new URL("../catalog/ui/components/icons/LICENSE.nucleo", import.meta.url),
      "utf-8"
    );
    let sharedSource: string | undefined;
    for (const area of order) {
      const target = area as "admin" | "public";
      const address =
        target === "admin" ? block.address : "@dinvolt/public-actions";
      await addUIComponents(root, [address], { target }, install);
      const blockName = target === "admin" ? "admin-panel" : "public-actions";
      expect(
        await readFile(join(root, `docs/licenses/dinvolt-${blockName}.txt`))
      ).toEqual(await readFile(new URL("../LICENSE", import.meta.url)));
      expect(
        await readFile(
          join(root, "src/components/icons/LICENSE.nucleo"),
          "utf-8"
        )
      ).toBe(iconNotice);
      const source = await readFile(
        join(root, "src/components/icons/outline/trash.tsx"),
        "utf-8"
      );
      if (sharedSource !== undefined) {
        expect(source).toBe(sharedSource);
      }
      sharedSource = source;
      await addUIComponents(root, [address], { target }, install);
    }
    expect(installs).toBe(2);
    for (const area of ["admin/", ""]) {
      const source = await readFile(
        join(root, `src/components/${area}ui/delete-button.tsx`),
        "utf-8"
      );
      expect(source).toContain('from "@/components/icons/outline/trash"');
      expect(source).toContain(`from "@/components/${area}ui/button"`);
      expect(source).not.toContain("@/components/admin/icons/");
    }
    expect(await readdir(join(root, "src/components/admin"))).not.toContain(
      "icons"
    );
    const login = await readFile(
      join(root, "src/components/admin/login-form.tsx"),
      "utf-8"
    );
    expect(login).toContain('from "@/components/icons/fill/password"');
    expect(
      await readFile(join(root, "src/components/admin/login-background.jpg"))
    ).toEqual(
      await readFile(
        new URL(
          "../catalog/registry/admin-panel/auth/login-background.jpg",
          import.meta.url
        )
      )
    );
  }
);

test.each([false, true])(
  "shared icons preserve unknown or customized files (recorded: %s)",
  async (recorded) => {
    const root = await fixture();
    if (recorded) {
      await addUIComponents(root, [block.address], {}, fakeInstall);
    }
    const path = "src/components/icons/outline/trash.tsx";
    await put(root, path, "// custom shared icon\n");
    await expect(
      addUIComponents(
        root,
        ["@dinvolt/public-actions"],
        { target: "public", overwrite: true },
        async () => {
          throw new Error("must not install over shared customizations");
        }
      )
    ).rejects.toThrow("--overwrite does not replace");
    expect(await readFile(join(root, path), "utf-8")).toBe(
      "// custom shared icon\n"
    );
  }
);

test("standalone registry installation remaps imports, preserves logos and remains safe to repeat", async () => {
  const root = await fixture();
  await put(
    root,
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } })
  );
  const profile = JSON.parse(
    await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8")
  );
  profile.aliases.components = "@/components";
  profile.aliases.ui = "@/components/ui";
  profile.aliases.hooks = "@/hooks";
  await put(root, ".dinvolt/ui/admin.json", JSON.stringify(profile));
  await put(
    root,
    ".dinvolt/ui/config.json",
    JSON.stringify({ projectType: "admin", defaultTarget: "admin" })
  );
  await put(root, "src/app/(admin)/layout.tsx", '<html data-ui="admin" />');
  await put(
    root,
    "src/app/globals.css",
    ":root { --primary: black; } .dark { --primary: white; }"
  );
  await put(
    root,
    "src/components/logo-complete.tsx",
    "export const LogoComplete = () => null;"
  );
  const logo = await readFile(
    join(root, "src/components/logo-iso.tsx"),
    "utf-8"
  );
  let installs = 0;
  const install = async (directory: string, args: string[]) => {
    installs += 1;
    const active = JSON.parse(
      await readFile(join(directory, "components.json"), "utf-8")
    );
    const payload = JSON.parse(await readFile(args[1]!, "utf-8"));
    await updateFiles(
      payload.files,
      await resolveConfigPaths(directory, active),
      { plannedFiles: payload.files, silent: true, interactive: false }
    );
  };
  await addUIComponents(root, [block.address], {}, install);
  await addUIComponents(root, [block.address], {}, install);
  expect(installs).toBe(1);
  expect(
    await readFile(join(root, "src/components/logo-iso.tsx"), "utf-8")
  ).toBe(logo);
  expect(
    await readFile(join(root, "src/app/(admin)/(auth)/page.tsx"), "utf-8")
  ).toContain('"@/components/login-screen"');
  expect(
    await readFile(join(root, "src/components/login-form.tsx"), "utf-8")
  ).toContain('"@/components/ui/button"');
  await put(root, "src/components/login-form.tsx", "// customized login\n");
  await expect(
    addUIComponents(root, [block.address], { overwrite: true }, install)
  ).rejects.toThrow("--overwrite does not replace");
  expect(installs).toBe(1);
});
