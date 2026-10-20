import { expect, test } from "bun:test";

import { repositorySource } from "../apps/docs/lib/repository-source.ts";

test("documentation publishes reviewed sources, rewrites repository links and omits prompt maintenance notes", async () => {
  const { entries, diagnostics } = await repositorySource.load();
  expect(diagnostics).toEqual([]);
  expect(entries.map(({ ref }) => ref)).toEqual([
    "reference/cli.md",
    "guides/vercel.mdx",
    "guides/database.mdx",
    "guides/authentication.mdx",
    "guides/data.md",
    "ui/blocks.mdx",
    "agents/project-prompt.md",
  ]);
  const cli = entries.find(({ ref }) => ref === "reference/cli.md")!;
  const vercel = entries.find(({ ref }) => ref === "guides/vercel.mdx")!;
  const prompt = entries.find(({ ref }) => ref === "agents/project-prompt.md")!;
  expect(cli.body.text).toContain("](/guides/vercel)");
  expect(cli.body.text).toContain(
    "](https://github.com/nicoandrade/dinvolt/blob/main/CONTRIBUTING.md)"
  );
  expect(vercel.body.text).toContain(
    "](/reference/cli#vercel-setup-without-a-wizard)"
  );
  expect(prompt.body.text).toContain("Create a new project with Dinvolt");
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
