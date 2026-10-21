import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  documentSections,
  mapProse,
  sectionAnchorTargets,
} from "../apps/docs/lib/document-sections.ts";
import { repositorySource } from "../apps/docs/lib/repository-source.ts";

test("documentation publishes reviewed sources, rewrites repository links and omits prompt maintenance notes", async () => {
  const { entries, diagnostics } = await repositorySource.load();
  expect(diagnostics).toEqual([]);
  expect(entries.map(({ ref }) => ref.replace(/\.mdx?$/u, ""))).toEqual([
    "reference/cli",
    "reference/create",
    "reference/setup",
    "reference/ui-add",
    "reference/vercel-setup",
    "reference/json",
    "guides/vercel",
    "guides/vercel/environments",
    "guides/vercel/automation",
    "guides/vercel/configuration",
    "guides/database",
    "guides/database/migrations",
    "guides/database/environments",
    "guides/database/turso",
    "guides/database/planetscale",
    "guides/database/troubleshooting",
    "guides/authentication",
    "guides/authentication/administrators",
    "guides/authentication/sessions",
    "guides/authentication/password-recovery",
    "guides/authentication/configuration",
    "guides/data",
    "guides/data/procedures",
    "guides/data/server-rendering",
    "guides/data/query-cache",
    "guides/data/admin-tables",
    "ui/blocks",
    "ui/admin-panel",
    "ui/actions",
    "agents/project-prompt",
  ]);
  const cli = entries.find(({ ref }) => ref === "reference/vercel-setup.mdx")!;
  const ui = entries.find(({ ref }) => ref === "reference/ui-add.mdx")!;
  const vercel = entries.find(({ ref }) => ref === "guides/vercel.mdx")!;
  const automation = entries.find(
    ({ ref }) => ref === "guides/vercel/automation.mdx"
  )!;
  const prompt = entries.find(({ ref }) => ref === "agents/project-prompt.md")!;
  expect(cli.body.text).toContain("](/guides/vercel)");
  expect(ui.body.text).toContain("](/ui/blocks)");
  expect(vercel.body.text).toContain("](/guides/vercel/automation)");
  expect(automation.body.text).toContain(
    "](/reference/vercel-setup#dinvolt-vercel-setup)"
  );
  expect(automation.body.text).toContain(
    "](/reference/json#automation-and-json)"
  );
  expect(prompt.body.text).toContain("Create a new project with Dinvolt");
  expect(prompt.body.text).toContain(
    '```text wrap title="Project creation prompt"'
  );
  expect(prompt.body.text).not.toContain("Maintaining the example");
  expect(prompt.body.text).not.toContain("Verification baseline");
  for (const entry of entries) {
    expect(entry.body.text).not.toContain(".env.demo.local");
    expect(entry.body.text).not.toContain(
      "## Real Turso database for end-to-end tests"
    );
    expect(entry.editUrl).toStartWith(
      "https://github.com/nicoandrade/dinvolt/edit/main/"
    );
  }
});

test("publishes each source section once across focused pages", async () => {
  const { entries } = await repositorySource.load();
  const paths = new Set(entries.map(({ sourcePath }) => sourcePath));
  for (const path of paths) {
    if (!path || path.endsWith("docs/agent-prompt.md")) {
      continue;
    }
    const original = await readFile(path, "utf-8");
    const expected = documentSections(original)
      .map(({ title }) => title)
      .filter(Boolean)
      .toSorted();
    const actual = entries
      .filter(({ sourcePath }) => sourcePath === path)
      .flatMap(({ body }) => documentSections(body.text))
      .map(({ title }) => title)
      .filter((title) => title && title !== "In this section")
      .toSorted();
    expect(actual).toEqual(expected);
  }
});

test("focused guides retain the source's standalone routes and import context", async () => {
  const { entries } = await repositorySource.load();
  const affected = entries.filter(({ sourcePath }) =>
    [
      "catalog/auth/README.md",
      "catalog/trpc/README.md",
      "catalog/registry/README.md",
    ].some((path) => sourcePath?.endsWith(path))
  );
  expect(affected.length).toBeGreaterThan(3);
  for (const entry of affected) {
    expect(
      entry.body.text.match(/For \*\*Admin panel only\*\* projects/gu)
    ).toHaveLength(1);
    expect(entry.body.text).toContain("the login is `/`");
    expect(entry.body.text).toContain("the home page is `/dashboard`");
    expect(entry.body.text).toContain("`@/components/ui`");
    expect(entry.body.text).toContain(
      "`/api/admin/users/export` keep their paths"
    );
  }
  const database = entries.find(({ ref }) => ref === "guides/database.mdx")!;
  expect(database.body.text).not.toContain("For **Admin panel only** projects");
});

test("keeps database setup focused and sends moved anchors to their owning page", async () => {
  const { entries } = await repositorySource.load();
  const database = entries.find(({ ref }) => ref === "guides/database.mdx")!;
  const configuration = entries.find(
    ({ ref }) => ref === "guides/authentication/configuration.mdx"
  )!;
  const ui = entries.find(({ ref }) => ref === "ui/blocks.mdx")!;
  expect(database.body.text).toContain("## Connect your database");
  expect(database.body.text).not.toContain("## Environment file loading");
  expect(database.body.text).toContain("](/guides/database/environments)");
  expect(database.body.text).toContain("](/guides/data)");
  expect(configuration.body.text).toContain(
    "](/guides/database/environments#database-environments)"
  );
  expect(configuration.body.text).toContain(
    "](/guides/database/migrations#change-your-schema)"
  );
  expect(ui.body.text).toContain("](/ui/admin-panel#admin-panel)");
  expect(ui.body.text).toContain('id="admin-panel"');
});

test("section parsing and link rewriting preserve fenced examples", () => {
  const markdown = [
    "Intro [guide](auth.md).",
    "",
    "## Read data",
    "",
    "````md",
    "## Example heading",
    "```sh",
    "echo '[guide](auth.md)'",
    "```",
    "````",
    "",
    "### Check the result",
    "",
    "## Continue",
    "",
    "[guide](auth.md)",
  ].join("\n");
  const sections = documentSections(markdown);
  expect(sections.map(({ title }) => title)).toEqual([
    "",
    "Read data",
    "Continue",
  ]);
  expect(sections[1]!.anchors).toEqual(["read-data", "check-the-result"]);
  const rewritten = mapProse(markdown, (prose) =>
    prose.replaceAll("(auth.md)", "(/guides/authentication)")
  );
  expect(rewritten).toContain("echo '[guide](auth.md)'");
  expect(rewritten).toContain("Intro [guide](/guides/authentication).");
  expect(rewritten).toEndWith("[guide](/guides/authentication)\n");
});

test("does not rewrite links in inline code or indented examples", () => {
  const markdown = [
    "Use `[guide](auth.md)` or ``a ` [guide](auth.md)`` as a literal.",
    "",
    "    [guide](auth.md)",
    "",
    "Read [guide](auth.md).",
  ].join("\n");
  const result = mapProse(markdown, (prose) =>
    prose.replaceAll("(auth.md)", "(/guides/authentication)")
  );
  expect(result).toContain("`[guide](auth.md)`");
  expect(result).toContain("``a ` [guide](auth.md)``");
  expect(result).toContain("    [guide](auth.md)");
  expect(result).toContain("Read [guide](/guides/authentication).");
});

test("resolves duplicate source headings after their pages are split", () => {
  const sections = documentSections(
    "## First task\n\n### Example\n\nFirst.\n\n## Second task\n\n### Example\n\nSecond."
  );
  const second = sections.filter(({ title }) => title === "Second task");
  expect(sectionAnchorTargets(second).get("example-1")).toBe("example");
  expect(sectionAnchorTargets(second).get("second-task")).toBe("second-task");
});
