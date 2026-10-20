import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { parse } from "postcss";

import { defaultUIPresets } from "../src/ui-presets.ts";
import { addUIComponents, prepareUIStarter } from "../src/ui.ts";

const directories: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-ui-test-"));
  directories.push(root);
  await mkdir(join(root, ".dinvolt/ui"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "my-app", packageManager: "bun@1.4.3" })
  );
  for (const target of ["admin", "public"] as const) {
    const components =
      target === "admin" ? "@/components/admin" : "@/components";
    await writeFile(
      join(root, `.dinvolt/ui/${target}.json`),
      JSON.stringify({
        style: target === "admin" ? "radix-nova" : "radix-vega",
        aliases: { components, ui: `${components}/ui`, utils: "@/lib/utils" },
        tailwind: { css: `src/styles/${target}.css` },
      })
    );
  }
  return root;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

const adminRules = (source: ReturnType<typeof parse>) =>
  source.nodes
    .filter(
      (node) => node.type === "rule" && node.selector.includes(".admin-panel")
    )
    .map((node) => node.toString());

test("defaults to admin, forwards multiple components and restores the original config exactly", async () => {
  const root = await fixture();
  const original = '{ "style": "original", "custom": true }\n';
  await writeFile(join(root, "components.json"), original);
  const result = await addUIComponents(
    root,
    ["button", "dialog"],
    {},
    async (cwd, args) => {
      expect(cwd).toBe(await realpath(root));
      expect(args).toEqual(["add", "button", "dialog", "--yes"]);
      const active = JSON.parse(
        await readFile(join(root, "components.json"), "utf-8")
      );
      expect(active.style).toBe("radix-nova");
      expect(active.aliases.ui).toBe("@/components/admin/ui");
    }
  );
  expect(result).toEqual({ target: "admin", path: "src/components/admin/ui" });
  expect(await readFile(join(root, "components.json"), "utf-8")).toBe(original);
  expect(await readdir(join(root, ".dinvolt/ui"))).not.toContain(".lock");
});

test("public uses its own profile and an originally missing root config stays missing", async () => {
  const root = await fixture();
  const admin = await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8");
  await addUIComponents(
    root,
    ["input"],
    { target: "public", overwrite: true },
    async (_, args) => {
      expect(args).toEqual(["add", "input", "--yes", "--overwrite"]);
      const active = JSON.parse(
        await readFile(join(root, "components.json"), "utf-8")
      );
      expect(active.style).toBe("radix-vega");
      expect(active.aliases.ui).toBe("@/components/ui");
    }
  );
  expect(await readdir(root)).not.toContain("components.json");
  expect(await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8")).toBe(
    admin
  );
});

test("a failed official command restores the original config and releases the lock", async () => {
  const root = await fixture();
  await writeFile(join(root, "components.json"), "original\n");
  await expect(
    addUIComponents(root, ["button"], {}, async () => {
      throw new Error("Registry unavailable");
    })
  ).rejects.toThrow("Registry unavailable");
  expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
    "original\n"
  );
  expect(await readdir(join(root, ".dinvolt/ui"))).not.toContain(".lock");
});

test("failed restoration retains the backup and never writes through a replacement symlink", async () => {
  const root = await fixture();
  const original = '{ "original": true }\n';
  await writeFile(join(root, "components.json"), original);
  const outside = join(root, "outside.json");
  await writeFile(outside, "preserve me");
  await expect(
    addUIComponents(root, ["button"], {}, async () => {
      await rm(join(root, "components.json"));
      await symlink(outside, join(root, "components.json"));
    })
  ).rejects.toThrow("symbolic link");
  expect(await readFile(outside, "utf-8")).toBe("preserve me");
  expect(
    await readFile(join(root, ".dinvolt/ui/.lock/components.json"), "utf-8")
  ).toBe(original);
  expect(
    JSON.parse(
      await readFile(join(root, ".dinvolt/ui/.lock/state.json"), "utf-8")
    ).hadComponentsConfig
  ).toBe(true);
});

test("a concurrent profile edit is preserved while the root configuration is restored", async () => {
  const root = await fixture();
  await writeFile(join(root, "components.json"), "original\n");
  const changed = '{ "customized": true }\n';
  await expect(
    addUIComponents(root, ["button"], {}, async () => {
      await writeFile(join(root, ".dinvolt/ui/admin.json"), changed);
      await writeFile(
        join(root, "components.json"),
        '{ "updatedByCli": true }\n'
      );
    })
  ).rejects.toThrow("profile changed during installation");
  expect(await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8")).toBe(
    changed
  );
  expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
    "original\n"
  );
});

test("simultaneous operations cannot activate different profiles", async () => {
  const root = await fixture();
  await addUIComponents(root, ["button"], {}, async () => {
    await expect(
      addUIComponents(root, ["input"], { target: "public" }, async () => {})
    ).rejects.toThrow("Another Dinvolt UI operation");
    expect(
      JSON.parse(await readFile(join(root, "components.json"), "utf-8")).aliases
        .ui
    ).toBe("@/components/admin/ui");
  });
});

test("only the selected profile receives configuration updates from shadcn", async () => {
  const root = await fixture();
  const originalPublic = await readFile(
    join(root, ".dinvolt/ui/public.json"),
    "utf-8"
  );
  await addUIComponents(root, ["button"], {}, async () => {
    const active = JSON.parse(
      await readFile(join(root, "components.json"), "utf-8")
    );
    active.registries = { "@example": "https://example.com/{name}.json" };
    await writeFile(join(root, "components.json"), JSON.stringify(active));
  });
  expect(
    JSON.parse(await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8"))
      .registries
  ).toHaveProperty("@example");
  expect(await readFile(join(root, ".dinvolt/ui/public.json"), "utf-8")).toBe(
    originalPublic
  );
});

test("refuses symlinked configuration without writing through the link", async () => {
  const root = await fixture();
  const outside = join(root, "outside.json");
  await writeFile(outside, "original");
  await symlink(outside, join(root, "components.json"));
  await expect(
    addUIComponents(root, ["button"], {}, async () => {})
  ).rejects.toThrow("symbolic link");
  expect(await readFile(outside, "utf-8")).toBe("original");
});

test("rejects profiles that route admin UI components into the public area", async () => {
  const root = await fixture();
  await writeFile(
    join(root, ".dinvolt/ui/admin.json"),
    await readFile(join(root, ".dinvolt/ui/public.json"))
  );
  await expect(
    addUIComponents(root, ["button"], {}, async () => {})
  ).rejects.toThrow("@/components/admin/ui");
  expect(await readdir(root)).not.toContain("components.json");
});

async function starterFixture() {
  const root = await mkdtemp(join(tmpdir(), "dinvolt-ui-starter-test-"));
  directories.push(root);
  await mkdir(join(root, "src/app"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "my-app",
      dependencies: { next: "16.4.2", custom: "1.0.0" },
    })
  );
  for (const name of ["layout.tsx", "page.tsx"]) {
    await writeFile(
      join(root, "src/app", name),
      await readFile(new URL(`../catalog/next/${name}`, import.meta.url))
    );
  }
  await writeFile(
    join(root, "src/app/globals.css"),
    '@import "tailwindcss";\n'
  );
  return root;
}

test("prepares the chosen presets with shared scoped CSS and separate component destinations", async () => {
  const root = await starterFixture();
  await writeFile(join(root, "AGENTS.md"), "# Existing project instructions\n");
  await prepareUIStarter(root);
  const admin = JSON.parse(
    await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8")
  );
  const publicConfig = JSON.parse(
    await readFile(join(root, ".dinvolt/ui/public.json"), "utf-8")
  );
  expect(admin.style).toBe("base-vega");
  expect(publicConfig.style).toBe("base-luma");
  expect(admin.aliases.ui).toBe("@/components/admin/ui");
  expect(publicConfig.aliases.ui).toBe("@/components/ui");
  expect(admin.tailwind.css).toBe("src/app/globals.css");
  expect(publicConfig.tailwind.css).toBe("src/app/globals.css");
  expect(
    await readFile(join(root, "src/app/(public)/layout.tsx"), "utf-8")
  ).toContain("@/app/globals.css");
  const adminLayout = await readFile(
    join(root, "src/app/(admin)/layout.tsx"),
    "utf-8"
  );
  expect(adminLayout).toContain("@/app/globals.css");
  expect(adminLayout).toContain('className="admin-panel"');
  const css = await readFile(join(root, "src/app/globals.css"), "utf-8");
  expect(css).toContain(":root {");
  expect(css).toContain(".admin-panel {");
  expect(css).toContain(".admin-panel.dark");
  expect(await readdir(join(root, "src/app/(admin)/admin"))).toEqual([
    "opengraph-image.tsx",
  ]);
  expect(await readdir(join(root, "src/app"))).not.toContain("layout.tsx");
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf-8")
  );
  expect(manifest.dependencies.next).toBe("16.4.2");
  expect(manifest.dependencies.custom).toBe("1.0.0");
  expect(manifest.dependencies["@fontsource-variable/inter"]).toBe("^5.3.0");
  const instructions = await readFile(join(root, "AGENTS.md"), "utf-8");
  expect(instructions).toContain("# Existing project instructions");
  expect(instructions).toContain("dinvolt ui add <component>");
  expect(instructions).toContain("<!-- BEGIN:dinvolt-ui -->");
});

test.each(["public", "public-admin"] as const)(
  "%s home imports its generated background asset from a resolvable static path",
  async (type) => {
    const root = await starterFixture();
    await prepareUIStarter(root, {}, undefined, type);
    const path = join(root, "src/app/(public)/page.tsx");
    const page = await readFile(path, "utf-8");
    const background = page.match(
      /import welcomeBackground from "(?<path>[^"]+)"/u
    )?.groups?.path;
    expect(background).toBeDefined();
    expect(await readFile(resolve(dirname(path), background!))).toEqual(
      await readFile(
        new URL("../catalog/ui/welcome-background.webp", import.meta.url)
      )
    );
  }
);

test("generates separate OG images with the selected project name and bundled local assets", async () => {
  const root = await starterFixture();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "demo-1", dependencies: { next: "16.4.2" } })
  );
  await prepareUIStarter(root);
  const publicImage = await readFile(
    join(root, "src/app/(public)/opengraph-image.tsx"),
    "utf-8"
  );
  const adminImage = await readFile(
    join(root, "src/app/(admin)/admin/opengraph-image.tsx"),
    "utf-8"
  );
  const site = await readFile(join(root, "src/config/site.ts"), "utf-8");
  expect(site).toContain('name: "demo-1"');
  expect(site).toContain('"https://demo-1.localhost"');
  expect(site).not.toContain("__PROJECT_NAME__");
  expect(site).not.toContain("__DEVELOPMENT_URL__");
  expect(publicImage).toContain("export const alt = siteConfig.name");
  expect(adminImage).toContain(`Admin Panel | \${siteConfig.name}`);
  expect(
    await readFile(join(root, "src/app/(public)/layout.tsx"), "utf-8")
  ).toContain("default: siteConfig.name");
  expect(
    await readFile(join(root, "src/app/(admin)/layout.tsx"), "utf-8")
  ).toContain(`Admin Panel | \${siteConfig.name}`);
  expect(await readdir(join(root, "src/app/(admin)"))).not.toContain(
    "opengraph-image.tsx"
  );
  expect(await readdir(join(root, "assets/og"))).not.toContain("iso.svg");
  expect(await readFile(join(root, "src/lib/og-image.tsx"), "utf-8")).toContain(
    "<LogoIso"
  );
  for (const asset of ["Inter-Bold.ttf", "Inter-OFL.txt"]) {
    expect(await readFile(join(root, `assets/og/${asset}`))).toEqual(
      await readFile(new URL(`../catalog/ui/og/${asset}`, import.meta.url))
    );
  }
});

test("preserves existing site configuration before changing starter files", async () => {
  const root = await starterFixture();
  await mkdir(join(root, "src/config"), { recursive: true });
  await writeFile(join(root, "src/config/site.ts"), "// Custom identity\n");
  const layout = await readFile(join(root, "src/app/layout.tsx"), "utf-8");
  await expect(prepareUIStarter(root)).rejects.toThrow("src/config/site.ts");
  expect(await readFile(join(root, "src/config/site.ts"), "utf-8")).toBe(
    "// Custom identity\n"
  );
  expect(await readFile(join(root, "src/app/layout.tsx"), "utf-8")).toBe(
    layout
  );
});

test("preserves an existing OG asset before changing any starter files", async () => {
  const root = await starterFixture();
  await mkdir(join(root, "assets/og"), { recursive: true });
  await writeFile(join(root, "assets/og/Inter-Bold.ttf"), "custom font");
  const layout = await readFile(join(root, "src/app/layout.tsx"), "utf-8");
  await expect(prepareUIStarter(root)).rejects.toThrow(
    "assets/og/Inter-Bold.ttf"
  );
  expect(await readFile(join(root, "assets/og/Inter-Bold.ttf"), "utf-8")).toBe(
    "custom font"
  );
  expect(await readFile(join(root, "src/app/layout.tsx"), "utf-8")).toBe(
    layout
  );
  expect(await readdir(join(root, "src/app"))).not.toContain("(public)");
});

test("the first add prepares an untouched older Dinvolt starter and defaults to admin", async () => {
  const root = await starterFixture();
  await addUIComponents(root, ["button"], {}, async () => {
    expect(
      JSON.parse(await readFile(join(root, "components.json"), "utf-8")).aliases
        .ui
    ).toBe("@/components/admin/ui");
  });
  expect(
    JSON.parse(await readFile(join(root, "components.json"), "utf-8")).style
  ).toBe("base-vega");
  expect(await readdir(join(root, ".dinvolt/ui"))).not.toContain(".lock");
});

test("custom presets configure actual scoped tokens, fonts, dependencies and later component installs", async () => {
  const root = await starterFixture();
  const requested: string[] = [];
  const presets = { public: "b0", admin: "bImMZYe" };
  await prepareUIStarter(root, presets, async (code) => {
    requested.push(code);
    const admin = code === presets.admin;
    return {
      config: {
        style: admin ? "base-vega" : "base-nova",
        iconLibrary: admin ? "tabler" : "lucide",
        menuAccent: "bold",
        tailwind: { baseColor: "stone" },
      },
      light: {
        primary: admin ? "cyan" : "black",
        radius: admin ? "1rem" : "0.5rem",
      },
      dark: { primary: admin ? "teal" : "white" },
      fonts: [
        {
          variable: "--font-sans",
          family: "'Outfit Variable', sans-serif",
          dependency: "@fontsource-variable/outfit",
        },
        ...(admin
          ? [
              {
                variable: "--font-heading",
                family: "'Lora Variable', serif",
                dependency: "@fontsource-variable/lora",
              },
            ]
          : []),
      ],
      dependencies: {
        "@fontsource-variable/outfit": "latest",
        ...(admin
          ? {
              "@fontsource-variable/lora": "latest",
              "@tabler/icons-react": "latest",
            }
          : {}),
      },
    };
  });
  expect(requested).toEqual([presets.admin, presets.public]);
  const settings = JSON.parse(
    await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8")
  );
  expect(settings.presets).toEqual(presets);
  const css = parse(await readFile(join(root, "src/app/globals.css"), "utf-8"));
  const tokens: Record<string, Record<string, string>> = {};
  css.walkRules((rule) => {
    if (rule.parent?.type === "root") {
      tokens[rule.selector] = {};
      rule.walkDecls((decl) => {
        tokens[rule.selector]![decl.prop] = decl.value;
      });
    }
  });
  expect(tokens[":root"]!["--primary"]).toBe("black");
  expect(tokens[".dark"]!["--primary"]).toBe("white");
  expect(tokens[".admin-panel"]!["--primary"]).toBe("cyan");
  expect(tokens[".dark .admin-panel,\n.admin-panel.dark"]!["--primary"]).toBe(
    "teal"
  );
  expect(tokens[":root"]!["--font-title"]).toBe("var(--font-body)");
  expect(tokens[".admin-panel"]!["--font-title"]).toContain("Lora");
  expect(tokens[".admin-panel"]!["--radius"]).toBe("1rem");
  expect(
    css.toString().match(/@import "@fontsource-variable\/outfit"/gu)
  ).toHaveLength(1);
  const { dependencies } = JSON.parse(
    await readFile(join(root, "package.json"), "utf-8")
  );
  expect(dependencies["@fontsource-variable/lora"]).toBe("latest");
  expect(dependencies["@tabler/icons-react"]).toBe("latest");
  const instructions = await readFile(join(root, "AGENTS.md"), "utf-8");
  expect(instructions).toContain(
    await readFile(
      new URL("../catalog/ui/agent-instructions.md", import.meta.url),
      "utf-8"
    )
  );
  for (const target of ["admin", "public"] as const) {
    await addUIComponents(root, ["button"], { target }, async () => {
      const config = JSON.parse(
        await readFile(join(root, "components.json"), "utf-8")
      );
      expect(config.style).toBe(target === "admin" ? "base-vega" : "base-nova");
      expect(config.aliases.ui).toBe(
        target === "admin" ? "@/components/admin/ui" : "@/components/ui"
      );
      expect(config.tailwind.baseColor).toBe("stone");
      expect(config.tailwind.css).toBe(".dinvolt/ui/.lock/theme.css");
    });
  }
});

test("a preset lookup failure preserves the original app without partially applying profiles", async () => {
  const root = await starterFixture();
  const manifest = await readFile(join(root, "package.json"), "utf-8");
  await expect(
    prepareUIStarter(root, { admin: "b0" }, async () => {
      throw new Error("Registry unavailable");
    })
  ).rejects.toThrow("Registry unavailable");
  expect(await readFile(join(root, "package.json"), "utf-8")).toBe(manifest);
  expect(await readFile(join(root, "src/app/globals.css"), "utf-8")).toBe(
    '@import "tailwindcss";\n'
  );
  expect(await readdir(join(root, "src/app"))).toContain("layout.tsx");
  expect(await readdir(root)).not.toContain(".dinvolt");
});

test("overriding one area preserves the other default and shared instructions", async () => {
  const root = await starterFixture();
  const calls: string[] = [];
  const originalCSS = await readFile(
    new URL("../catalog/ui/globals.css", import.meta.url),
    "utf-8"
  );
  // Selecting the other area's default must leave that profile unchanged.
  await prepareUIStarter(
    root,
    { public: defaultUIPresets.admin },
    async (code) => {
      calls.push(code);
      return {
        config: { style: "base-vega" },
        light: { primary: "black" },
        dark: { primary: "white" },
        fonts: [
          {
            variable: "--font-sans",
            family: "Inter Variable",
            dependency: "@fontsource-variable/inter",
          },
        ],
        dependencies: {},
      };
    }
  );
  expect(calls).toEqual([defaultUIPresets.admin]);
  expect(await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8")).toBe(
    await readFile(
      new URL("../catalog/ui/admin.json", import.meta.url),
      "utf-8"
    )
  );
  const css = parse(await readFile(join(root, "src/app/globals.css"), "utf-8"));
  expect(adminRules(css)).toEqual(adminRules(parse(originalCSS)));
  const instructions = await readFile(join(root, "AGENTS.md"), "utf-8");
  expect(instructions).toContain(
    await readFile(
      new URL("../catalog/ui/agent-instructions.md", import.meta.url),
      "utf-8"
    )
  );
});

test("automatic preparation preserves customized application files", async () => {
  const root = await starterFixture();
  const page =
    "// My customized home page\nexport default function Custom() { return null; }\n";
  await writeFile(join(root, "src/app/page.tsx"), page);
  const manifest = await readFile(join(root, "package.json"), "utf-8");
  await expect(
    addUIComponents(root, ["button"], {}, async () => {})
  ).rejects.toThrow("customized");
  expect(await readFile(join(root, "src/app/page.tsx"), "utf-8")).toBe(page);
  expect(await readFile(join(root, "package.json"), "utf-8")).toBe(manifest);
  expect(await readdir(join(root, ".dinvolt/ui"))).toEqual([]);
});

test("shared CSS updates from the official CLI are merged only into the selected theme", async () => {
  const root = await starterFixture();
  await prepareUIStarter(root);
  const originalConfig = await readFile(join(root, "components.json"), "utf-8");
  await addUIComponents(root, ["chart"], {}, async () => {
    const active = JSON.parse(
      await readFile(join(root, "components.json"), "utf-8")
    );
    expect(active.tailwind.css).toBe(".dinvolt/ui/.lock/theme.css");
    const css = parse(await readFile(join(root, active.tailwind.css), "utf-8"));
    css.walkRules(":root", (rule) => {
      rule.append({ prop: "--custom-admin-token", value: "red" });
    });
    await writeFile(join(root, active.tailwind.css), css.toString());
  });
  const css = parse(await readFile(join(root, "src/app/globals.css"), "utf-8"));
  let publicToken: string | undefined;
  let adminToken: string | undefined;
  css.walkRules(":root", (rule) => {
    rule.walkDecls("--custom-admin-token", (decl) => {
      publicToken = decl.value;
    });
  });
  css.walkRules(".admin-panel", (rule) => {
    rule.walkDecls("--custom-admin-token", (decl) => {
      adminToken = decl.value;
    });
  });
  expect(publicToken).toBeUndefined();
  expect(adminToken).toBe("red");
  expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
    originalConfig
  );
  expect(
    JSON.parse(await readFile(join(root, ".dinvolt/ui/admin.json"), "utf-8"))
      .tailwind.css
  ).toBe("src/app/globals.css");
});

test("failed upstream CSS changes leave globals.css unchanged", async () => {
  const root = await starterFixture();
  await prepareUIStarter(root);
  const original = await readFile(join(root, "src/app/globals.css"), "utf-8");
  await expect(
    addUIComponents(root, ["chart"], {}, async () => {
      await writeFile(
        join(root, ".dinvolt/ui/.lock/theme.css"),
        ":root { --primary: red; }"
      );
      throw new Error("Registry failed");
    })
  ).rejects.toThrow("Registry failed");
  expect(await readFile(join(root, "src/app/globals.css"), "utf-8")).toBe(
    original
  );
});

test("concurrent user edits to globals.css are preserved", async () => {
  const root = await starterFixture();
  await prepareUIStarter(root);
  const edited = "/* My theme edit */\n:root { --primary: red; }\n";
  await expect(
    addUIComponents(root, ["chart"], {}, async () => {
      await writeFile(join(root, "src/app/globals.css"), edited);
    })
  ).rejects.toThrow("globals.css changed during installation");
  expect(await readFile(join(root, "src/app/globals.css"), "utf-8")).toBe(
    edited
  );
});

test.each([undefined, "b0"])(
  "public-only generation uses one profile, including a custom preset %s",
  async (preset) => {
    const root = await starterFixture();
    const resolved: string[] = [];
    await prepareUIStarter(
      root,
      { public: preset, admin: "not-a-valid-preset" },
      async (code) => {
        resolved.push(code);
        return {
          config: { style: "base-nova", iconLibrary: "lucide" },
          light: { primary: "black" },
          dark: { primary: "white" },
          fonts: [],
          dependencies: {},
        };
      },
      "public"
    );
    expect(resolved).toEqual(preset ? [preset] : []);
    const settings = JSON.parse(
      await readFile(join(root, ".dinvolt/ui/config.json"), "utf-8")
    );
    expect(settings.defaultTarget).toBe("public");
    expect(settings.presets).toEqual({
      public: preset ?? defaultUIPresets.public,
    });
    expect(await readdir(join(root, ".dinvolt/ui"))).not.toContain(
      "admin.json"
    );
    expect(await readdir(join(root, "src/app"))).not.toContain("(admin)");
    expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
      await readFile(join(root, ".dinvolt/ui/public.json"), "utf-8")
    );
    const css = await readFile(join(root, "src/app/globals.css"), "utf-8");
    expect(css).toContain(":root");
    expect(css).not.toContain(".admin-panel");
    const page = await readFile(
      join(root, "src/app/(public)/page.tsx"),
      "utf-8"
    );
    expect(page).not.toContain("/admin");
    const instructions = await readFile(join(root, "AGENTS.md"), "utf-8");
    expect(instructions).not.toMatch(/admin|both areas/iu);
    expect(instructions).toContain("Prerender static UI immediately");
    expect(instructions).toContain(
      "During background updates, retain usable data"
    );
    const original = await readFile(join(root, "components.json"), "utf-8");
    const added = await addUIComponents(root, ["button"], {}, async (cwd) => {
      const active = JSON.parse(
        await readFile(join(cwd, "components.json"), "utf-8")
      );
      expect(active.aliases.ui).toBe("@/components/ui");
    });
    expect(added.target).toBe("public");
    expect(await readFile(join(root, "components.json"), "utf-8")).toBe(
      original
    );
    await expect(
      addUIComponents(root, ["button"], { target: "admin" }, async () => {
        throw new Error("Should not install admin components");
      })
    ).rejects.toThrow("only has a public UI profile");
    expect(await readdir(join(root, ".dinvolt/ui"))).not.toContain(".lock");
  }
);
