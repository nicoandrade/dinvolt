import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareAuthStarter } from "../src/auth.ts";
import { createNextProject, runCreateNextApp } from "../src/create.ts";
import { prepareDatabaseStarter } from "../src/database.ts";
import { checkDevelopmentRuntime, developmentUrl } from "../src/development.ts";
import { prepareStarter } from "../src/setup.ts";
import { prepareTRPCStarter } from "../src/trpc.ts";
import { prepareUIStarter } from "../src/ui.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

test("local URLs support package names that are not DNS labels", () => {
  expect(developmentUrl("demo-1")).toBe("https://demo-1.localhost");
  expect(developmentUrl("my_app.web--")).toBe("https://my-app-web.localhost");
  const longName = "a".repeat(214);
  const { hostname } = new URL(developmentUrl(longName));
  expect(hostname.split(".")[0]).toHaveLength(63);
  expect(developmentUrl(longName)).not.toBe(
    developmentUrl(`${longName.slice(0, -1)}b`)
  );
});

test("only create requires the Node.js version needed by Portless", () => {
  expect(() => checkDevelopmentRuntime("22.18.0")).toThrow("Node.js 24");
  expect(() => checkDevelopmentRuntime("24.0.0")).not.toThrow();
  expect(() => checkDevelopmentRuntime("26.0.0")).not.toThrow();
});

test.each([
  ["current", "demo-1", "turso", "bun"],
  ["new", "proxy", "planetscale-postgres", "npm"],
  ["new", "my_app.web", "turso", "pnpm"],
] as const)(
  "%s starter %s shares its Portless origin with auth on %s",
  async (location, name, provider, manager) => {
    const directory = await mkdtemp(join(tmpdir(), "dinvolt-development-"));
    directories.push(directory);
    const project = await createNextProject(
      directory,
      name,
      location,
      async (destination) => {
        await runCreateNextApp(destination, "npm", true);
        await prepareStarter(destination, manager);
        await prepareUIStarter(destination);
        await prepareDatabaseStarter(destination, provider);
        await prepareAuthStarter(destination, provider);
        await prepareTRPCStarter(destination);
      }
    );
    const manifest = JSON.parse(
      await readFile(join(project.path, "package.json"), "utf-8")
    );
    const url = developmentUrl(name);
    expect(manifest.name).toBe(name);
    expect(manifest.scripts.dev).toBe(
      `node scripts/with-database-env.mjs development portless ${new URL(url).hostname} next dev`
    );
    expect(manifest.scripts.build).toBe("next build");
    expect(manifest.scripts.start).toBe("next start");
    expect(manifest.devDependencies.portless).toBe("0.15.8");
    expect(manifest.engines.node).toBe(">=24");
    expect(
      await readFile(join(project.path, "docs/licenses/dinvolt.txt"))
    ).toEqual(await readFile(new URL("../LICENSE", import.meta.url)));
    const appFiles = await readdir(join(project.path, "src/app"));
    for (const icon of ["favicon.ico", "icon.svg", "apple-icon.png"]) {
      expect(appFiles).not.toContain(icon);
    }
    for (const [source, target] of [
      ["icons.ts", "src/lib/icons.ts"],
      ["icon-image.tsx", "src/lib/icon-image.tsx"],
      ["icon-route.tsx", "src/app/icons/[variant]/route.tsx"],
      ["next.config.ts", "next.config.ts"],
    ] as const) {
      expect(await readFile(join(project.path, target))).toEqual(
        await readFile(new URL(`../catalog/next/${source}`, import.meta.url))
      );
    }
    expect(
      await readFile(join(project.path, "src/components/logo-iso.tsx"))
    ).toEqual(
      await readFile(
        new URL("../catalog/ui/components/logo-iso.tsx", import.meta.url)
      )
    );
    const site = await readFile(
      join(project.path, "src/config/site.ts"),
      "utf-8"
    );
    expect(site).toContain(`name: ${JSON.stringify(name)}`);
    expect(site).toContain(
      `process.env.NEXT_PUBLIC_SITE_URL ?? ${JSON.stringify(url)}`
    );
    for (const area of ["public", "admin"]) {
      const layout = await readFile(
        join(project.path, `src/app/(${area})/layout.tsx`),
        "utf-8"
      );
      expect(layout).toContain("metadataBase: new URL(siteConfig.url)");
      expect(layout).toContain(
        "<TRPCReactProvider>{children}</TRPCReactProvider>"
      );
      expect(layout).toContain("icons: siteIcons");
      expect(layout).not.toContain("__DEVELOPMENT_URL__");
      expect(layout).not.toContain("__PROJECT_NAME__");
    }
    for (const file of [".env.local", ".env.example"]) {
      const env = await readFile(join(project.path, file), "utf-8");
      expect(env).toContain(`BETTER_AUTH_URL=${url}\n`);
      expect(env).not.toContain("__DEVELOPMENT_URL__");
    }
    const readme = await readFile(join(project.path, "README.md"), "utf-8");
    expect(readme).toContain(url);
    expect(readme).toContain("initialized with **Dinvolt**");
    expect(readme).toContain(`**${manager}**`);
    expect(readme).toContain(`${manager} run dev`);
    expect(readme).toContain(`${manager} run db:migrate`);
    expect(readme).toContain(
      `${manager} run auth:create-admin ${manager === "npm" ? "-- " : ""}--email admin@example.com --name Admin`
    );
    expect(readme).toContain("src/config/site.ts");
    for (const logo of ["logo", "logo-iso", "admin/logo-complete"]) {
      expect(readme).toContain(`src/components/${logo}.tsx`);
    }
    expect(readme).not.toMatch(/\{\{[A-Z][\w:]*\}\}/u);
    expect(readme).not.toContain("create-next-app");
    expect(readme).not.toContain("http://localhost:3000");
    expect(
      await readFile(join(project.path, "docs/development.md"), "utf-8")
    ).toContain(url);
  },
  15_000
);

test("public-only starter has public documentation and no backend setup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-public-"));
  directories.push(directory);
  const project = await createNextProject(
    directory,
    "public-site",
    "current",
    async (destination) => {
      await runCreateNextApp(destination, "npm", true);
      await prepareStarter(destination, "npm", "public");
      await prepareUIStarter(destination, {}, undefined, "public");
    }
  );
  const readme = await readFile(join(project.path, "README.md"), "utf-8");
  expect(
    await readFile(join(project.path, "docs/licenses/dinvolt.txt"))
  ).toEqual(await readFile(new URL("../LICENSE", import.meta.url)));
  expect(readme).toContain("npm run dev");
  expect(readme).toContain("https://public-site.localhost");
  expect(readme).toContain("src/components/logo-complete.tsx");
  expect(readme).not.toMatch(
    /\{\{|docs\/(?:auth|database|trpc)|auth:create|db:migrate|BETTER_AUTH|\/admin/u
  );
  const development = await readFile(
    join(project.path, "docs/development.md"),
    "utf-8"
  );
  expect(development).toContain("https://public-site.localhost");
  expect(development).not.toMatch(/BETTER_AUTH|docs\/auth|BEGIN:/iu);
  const manifest = JSON.parse(
    await readFile(join(project.path, "package.json"), "utf-8")
  );
  expect(manifest.scripts.dev).toBe("portless public-site.localhost next dev");
  expect(Object.keys(manifest.scripts).join(" ")).not.toMatch(/db:|auth:/u);
  expect(
    Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).join(
      " "
    )
  ).not.toMatch(/drizzle|turso|better-auth|trpc|tanstack|resend/u);
  expect((await readdir(join(project.path, "docs"))).toSorted()).toEqual([
    "development.md",
    "licenses",
  ]);
  expect(await readdir(project.path)).not.toContain(".env.local");
  const layout = await readFile(
    join(project.path, "src/app/(public)/layout.tsx"),
    "utf-8"
  );
  expect(layout).not.toContain("TRPCReactProvider");
  expect(layout).toContain("siteConfig");
}, 15_000);
