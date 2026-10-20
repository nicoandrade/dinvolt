import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ContentSource, SourceEntry } from "blume/sources";

import { withPackageManagerTabs } from "./package-manager-tabs.ts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const github = "https://github.com/nicoandrade/dinvolt/blob/main/";
const githubEdit = "https://github.com/nicoandrade/dinvolt/edit/main/";

// Only these reviewed public documents are published. Never scan the repository.
const documents = [
  {
    path: "docs/cli.md",
    slug: "reference/cli",
    title: "CLI reference",
    description: "Commands, flags, defaults and JSON contracts for Dinvolt.",
  },
  {
    path: "docs/vercel.md",
    slug: "guides/vercel",
    title: "Deploy with Vercel",
    description: "Connect your generated application to Vercel through Git.",
  },
  {
    path: "catalog/database/README.md",
    slug: "guides/database",
    title: "Database",
    description:
      "Configure Turso or PlanetScale Postgres, environments and migrations.",
  },
  {
    path: "catalog/auth/README.md",
    slug: "guides/authentication",
    title: "Authentication",
    description: "Set up Better Auth, administrators and password recovery.",
  },
  {
    path: "catalog/trpc/README.md",
    slug: "guides/data",
    title: "API and data",
    description: "Use the generated tRPC and TanStack Query integration.",
  },
  {
    path: "catalog/registry/README.md",
    slug: "ui/blocks",
    title: "Components and blocks",
    description:
      "Install and customize Dinvolt UI blocks and action components.",
  },
  {
    path: "docs/agent-prompt.md",
    slug: "agents/project-prompt",
    title: "Project creation prompt",
    description:
      "Copy this prompt to create and verify a starter with your coding agent.",
  },
] as const;

const markdownLink = /\]\((?<target>(?:\.\.?\/)?[\w./-]+\.md(?:#[\w-]+)?)\)/gu;
const firstHeading = /^# [^\n]+\n+/u;
const copyablePrompt =
  /## Copyable prompt\n+(?<prompt>```text\n[\s\S]*?\n```)\n/u;

function rewriteLinks(body: string, path: string) {
  return body.replace(markdownLink, (_match, target: string) => {
    const [file = "", anchor = ""] = target.split("#");
    const resolved = relative(
      repositoryRoot,
      resolve(repositoryRoot, dirname(path), file)
    );
    const published = documents.find((document) => document.path === resolved);
    const destination = published
      ? `/${published.slug}`
      : `${github}${resolved}`;
    return `](${destination}${anchor ? `#${anchor}` : ""})`;
  });
}

async function loadEntries(): Promise<SourceEntry[]> {
  return await Promise.all(
    documents.map(async (document) => {
      const sourcePath = resolve(repositoryRoot, document.path);
      const original = await readFile(sourcePath, "utf-8");
      let text = original.replace(firstHeading, "");
      if (document.path === "docs/agent-prompt.md") {
        const prompt = copyablePrompt.exec(original)?.groups?.prompt;
        if (!prompt) {
          throw new Error("Missing Copyable prompt in docs/agent-prompt.md.");
        }
        text = `Paste this prompt into your coding agent. It uses Dinvolt's published CLI and leaves deployment and custom application development for separate requests.\n\n${prompt}\n`;
      }
      const linked = rewriteLinks(text, document.path);
      const body = withPackageManagerTabs(linked);
      const format = body === linked ? "md" : "mdx";
      return {
        ref: `${document.slug}.${format}`,
        data: { title: document.title, description: document.description },
        body: { format, text: body },
        sourcePath,
        editUrl: `${githubEdit}${document.path}`,
      };
    })
  );
}

export const repositorySource: ContentSource = {
  name: "dinvolt-reference",
  staged: true,
  contentRoot: repositoryRoot,
  async load() {
    return { entries: await loadEntries(), diagnostics: [] };
  },
  watch(onChange) {
    const directories = new Set(documents.map(({ path }) => dirname(path)));
    const watchers = [...directories].map((directory) =>
      watch(resolve(repositoryRoot, directory), (_event, filename) => {
        if (
          filename &&
          documents.some(({ path }) => path === `${directory}/${filename}`)
        ) {
          onChange();
        }
      })
    );
    return () => {
      for (const watcher of watchers) {
        watcher.close();
      }
    };
  },
};
