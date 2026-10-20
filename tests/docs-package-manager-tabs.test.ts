import { expect, test } from "bun:test";

import { withPackageManagerTabs } from "../apps/docs/lib/package-manager-tabs.ts";
import { repositorySource } from "../apps/docs/lib/repository-source.ts";

test("keeps the working directory alongside the selected development command", () => {
  const result = withPackageManagerTabs("```sh\ncd my-app\nnpm run dev\n```");
  expect(result).toContain("```sh npm\ncd my-app\nnpm run dev\n```");
  expect(result).toContain("```sh bun\ncd my-app\nbun run dev\n```");
  expect(result).toContain("```sh pnpm\ncd my-app\npnpm run dev\n```");
  expect(result).toContain("```sh yarn\ncd my-app\nyarn run dev\n```");
});

test("preserves npm script argument forwarding without passing its separator to other managers", () => {
  const result = withPackageManagerTabs(
    '```sh\nnpm run auth:create-admin -- --email admin@example.com --name "Project Admin"\n```'
  );
  expect(result).toContain(
    'npm run auth:create-admin -- --email admin@example.com --name "Project Admin"'
  );
  expect(result).toContain(
    'bun run auth:create-admin --email admin@example.com --name "Project Admin"'
  );
  expect(result).toContain(
    'pnpm run auth:create-admin --email admin@example.com --name "Project Admin"'
  );
  expect(result).toContain(
    'yarn run auth:create-admin --email admin@example.com --name "Project Admin"'
  );
});

test("adds npm's argument separator to a Bun script example", () => {
  const result = withPackageManagerTabs(
    "```bash\nbun run auth:create-admin --email admin@example.com\n```"
  );
  expect(result).toContain(
    "npm run auth:create-admin -- --email admin@example.com"
  );
  expect(result).not.toContain("bun run auth:create-admin -- --email");
});

test("preserves package versions, multiline CLI flags and comments", () => {
  const result = withPackageManagerTabs(
    "```sh\n# Inspect setup.\nnpx --yes dinvolt@0.2.2 setup \\\n  --status --json\n```"
  );
  expect(result).toContain(
    "# Inspect setup.\npnpm dlx dinvolt@0.2.2 setup \\\n  --status --json"
  );
  expect(result).toContain("bunx dinvolt@0.2.2 setup");
  expect(result).toContain("npx --yes dinvolt@0.2.2 setup");
  expect(result).not.toContain("dlx --yes");
});

test("does not change manager-independent commands, prompts or application code", () => {
  const markdown = [
    "Use `npm run dev` in an existing project.",
    "```sh\ndinvolt setup --json\n```",
    "```text\nnpx dinvolt@latest create\n```",
    '```ts\nconst command = "npm run dev";\n```',
  ].join("\n\n");
  expect(withPackageManagerTabs(markdown)).toBe(markdown);
});

test("stages tabbed repository guides as MDX so Blume renders their components", async () => {
  const { entries } = await repositorySource.load();
  const database = entries.find((entry) => entry.ref === "guides/database.mdx");
  expect(database?.body.format).toBe("mdx");
  expect(database?.body.text).toContain("<CodeGroup>");
  for (const entry of entries) {
    expect(entry.ref.endsWith(`.${entry.body.format}`)).toBe(true);
  }
  const prompt = entries.find(
    (entry) => entry.ref === "agents/project-prompt.md"
  );
  expect(prompt?.body.text).not.toContain("<CodeGroup>");
});
