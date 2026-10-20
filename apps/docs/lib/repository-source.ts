import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ContentSource, SourceEntry } from "blume/sources";

import {
  documentSections,
  mapProse,
  sectionAnchorTargets,
} from "./document-sections.ts";
import type { DocumentSection } from "./document-sections.ts";
import { withPackageManagerTabs } from "./package-manager-tabs.ts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const github = "https://github.com/nicoandrade/dinvolt/blob/main/";
const githubEdit = "https://github.com/nicoandrade/dinvolt/edit/main/";

interface DocumentationPage {
  slug: string;
  title: string;
  description: string;
}

interface DocumentationChapter extends DocumentationPage {
  sections: readonly string[];
}

interface RepositoryDocument extends DocumentationPage {
  path: string;
  chapters?: readonly DocumentationChapter[];
}

interface PreparedPage extends DocumentationPage {
  document: RepositoryDocument;
  sections: DocumentSection[];
  anchorTargets: ReadonlyMap<string, string>;
  text: string;
}

// Only these reviewed public documents are published. Never scan the repository.
const documents: readonly RepositoryDocument[] = [
  {
    path: "docs/cli.md",
    slug: "reference/cli",
    title: "CLI reference",
    description: "Dinvolt commands, options and usage examples.",
    chapters: [
      {
        slug: "reference/create",
        title: "create",
        description: "Create a project with the wizard or explicit options.",
        sections: [
          "`dinvolt create`",
          "Non-interactive creation",
          "Credentials and administrator output",
        ],
      },
      {
        slug: "reference/setup",
        title: "setup",
        description: "Complete database connections and administrator setup.",
        sections: ["`dinvolt setup`"],
      },
      {
        slug: "reference/ui-add",
        title: "ui add",
        description: "Install components and blocks into a selected UI area.",
        sections: ["`dinvolt ui add`"],
      },
      {
        slug: "reference/vercel-setup",
        title: "vercel setup",
        description: "Configure Vercel hosting and Git integration.",
        sections: ["`dinvolt vercel setup`"],
      },
      {
        slug: "reference/json",
        title: "JSON and automation",
        description:
          "Read command results and continue after partial failures.",
        sections: ["Automation and JSON"],
      },
    ],
  },
  {
    path: "docs/vercel.md",
    slug: "guides/vercel",
    title: "Deploy with Vercel",
    description: "Connect your generated application to Vercel through Git.",
    chapters: [
      {
        slug: "guides/vercel/environments",
        title: "Domains and environments",
        description:
          "Configure Production, Preview, domains and recovery email.",
        sections: [
          "Environments and origins",
          "Production domains",
          "Preview deployments",
          "Password recovery",
        ],
      },
      {
        slug: "guides/vercel/automation",
        title: "Automate Vercel setup",
        description: "Connect hosting with explicit options and JSON results.",
        sections: ["Agents and scripts"],
      },
      {
        slug: "guides/vercel/configuration",
        title: "Hosting configuration",
        description:
          "Review project settings, secret handling and existing links.",
        sections: [
          "What the command changes",
          "Secrets and variable handling",
          "Official contracts",
        ],
      },
    ],
  },
  {
    path: "catalog/database/README.md",
    slug: "guides/database",
    title: "Database",
    description:
      "Configure Turso or PlanetScale Postgres, environments and migrations.",
    chapters: [
      {
        slug: "guides/database/migrations",
        title: "Database migrations",
        description: "Edit your schema, review SQL and apply a migration.",
        sections: ["Change your schema"],
      },
      {
        slug: "guides/database/environments",
        title: "Database environments",
        description:
          "Select credentials for local development, staging and production.",
        sections: [
          "Database environments",
          "Deploy on Vercel",
          "Environment file loading",
        ],
      },
      {
        slug: "guides/database/turso",
        title: "Turso",
        description: "Understand the generated Turso driver and connection.",
        sections: ["Turso Database"],
      },
      {
        slug: "guides/database/planetscale",
        title: "PlanetScale Postgres",
        description:
          "Configure application connections, migrations and pooling.",
        sections: ["PlanetScale Postgres"],
      },
      {
        slug: "guides/database/troubleshooting",
        title: "Database troubleshooting",
        description: "Resolve connection and initial migration problems.",
        sections: ["Initialization and troubleshooting"],
      },
    ],
  },
  {
    path: "catalog/auth/README.md",
    slug: "guides/authentication",
    title: "Authentication",
    description: "Set up Better Auth, administrators and password recovery.",
    chapters: [
      {
        slug: "guides/authentication/administrators",
        title: "Administrators and users",
        description: "Create the first administrator and manage user accounts.",
        sections: ["Create the first administrator", "Manage users"],
      },
      {
        slug: "guides/authentication/sessions",
        title: "Sessions and authorization",
        description: "Read sessions and protect server operations.",
        sections: ["Read and protect a session"],
      },
      {
        slug: "guides/authentication/password-recovery",
        title: "Password recovery",
        description: "Configure Resend and use the included reset flow.",
        sections: ["Password recovery and email"],
      },
      {
        slug: "guides/authentication/configuration",
        title: "Auth configuration",
        description:
          "Set deployment origins, change plugins and update the schema.",
        sections: [
          "Configure auth environments",
          "Customize authentication",
          "Customize the admin interface",
        ],
      },
    ],
  },
  {
    path: "catalog/trpc/README.md",
    slug: "guides/data",
    title: "API and data",
    description: "Use the generated tRPC and TanStack Query integration.",
    chapters: [
      {
        slug: "guides/data/procedures",
        title: "Protected procedures",
        description:
          "Add validated API operations and choose an authorization level.",
        sections: ["Add a protected procedure", "File reference"],
      },
      {
        slug: "guides/data/server-rendering",
        title: "Server rendering",
        description:
          "Read on the server or prefetch a query for client hydration.",
        sections: ["Read data on the server", "Prefetch and hydrate"],
      },
      {
        slug: "guides/data/query-cache",
        title: "Query cache and loading",
        description:
          "Refresh data, handle identity changes and scope loading states.",
        sections: [
          "Refresh data after changes",
          "Clear data after identity changes",
          "Build loading and error states",
        ],
      },
      {
        slug: "guides/data/admin-tables",
        title: "Admin tables and CSV",
        description:
          "Reuse table controls, URL filters, pagination and exports.",
        sections: ["Reusable admin tables", "Export filtered CSV"],
      },
    ],
  },
  {
    path: "catalog/registry/README.md",
    slug: "ui/blocks",
    title: "UI registry",
    description:
      "Install and customize Dinvolt UI blocks and action components.",
    chapters: [
      {
        slug: "ui/admin-panel",
        title: "Admin panel",
        description: "Sign in, manage users and extend the admin panel.",
        sections: ["Admin panel"],
      },
      {
        slug: "ui/actions",
        title: "Action components",
        description:
          "Add pending, copy and delete actions to your forms and pages.",
        sections: ["Action components"],
      },
    ],
  },
  {
    path: "docs/agent-prompt.md",
    slug: "agents/project-prompt",
    title: "Project creation prompt",
    description:
      "Copy this prompt to create and verify a starter with your coding agent.",
  },
];

const markdownLink = /\]\((?<target>[^\s)]+)\)/gu;
const firstHeading = /^# [^\n]+\n+/u;
const copyablePrompt =
  /## Copyable prompt\n+(?<prompt>```text\n[\s\S]*?\n```)\n/u;

// These guides also become docs/*.md in generated applications.
const generatedGuides: Record<string, string> = {
  "auth.md": "catalog/auth/README.md",
  "database.md": "catalog/database/README.md",
  "trpc.md": "catalog/trpc/README.md",
};

function rewriteLinks(page: PreparedPage, pages: PreparedPage[]): string {
  return mapProse(page.text, (prose) =>
    prose.replace(markdownLink, (match: string, target: string) => {
      const [file = "", anchor = ""] = target.split("#");
      let resolved: string;
      if (!file) {
        resolved = page.document.path;
      } else if (file.startsWith("/")) {
        const destination = pages.find(({ slug }) => `/${slug}` === file);
        if (!destination || !anchor) {
          return match;
        }
        resolved = destination.document.path;
      } else if (file.endsWith(".md")) {
        const generatedName = file.replace(/^docs\//u, "");
        if (generatedName === "development.md") {
          return "](/quickstart#run-locally)";
        }
        resolved =
          generatedGuides[generatedName] ??
          relative(
            repositoryRoot,
            resolve(repositoryRoot, dirname(page.document.path), file)
          );
      } else {
        return match;
      }

      const published = documents.find(({ path }) => path === resolved);
      const owner = anchor
        ? pages.find(
            (candidate) =>
              candidate.document.path === resolved &&
              candidate.anchorTargets.has(anchor)
          )
        : undefined;
      const destination = published
        ? `/${owner?.slug ?? published.slug}`
        : `${github}${resolved}`;
      const targetAnchor = owner?.anchorTargets.get(anchor) ?? anchor;
      return `](${destination}${targetAnchor ? `#${targetAnchor}` : ""})`;
    })
  );
}

function preparePages(
  document: RepositoryDocument,
  original: string
): PreparedPage[] {
  let text = original.replace(firstHeading, "");
  if (document.path === "docs/agent-prompt.md") {
    const prompt = copyablePrompt.exec(original)?.groups?.prompt;
    if (!prompt) {
      throw new Error("Missing Copyable prompt in docs/agent-prompt.md.");
    }
    const wrapped = prompt.replace(
      "```text\n",
      '```text wrap title="Project creation prompt"\n'
    );
    text = `Paste this prompt into your coding agent to create and verify a Dinvolt starter locally.\n\n${wrapped}\n`;
  }

  const sections = documentSections(text);
  const chapters = document.chapters ?? [];
  const selected = chapters.flatMap((chapter) => chapter.sections);
  for (const title of selected) {
    if (!sections.some((section) => section.title === title)) {
      throw new Error(`Missing section "${title}" in ${document.path}.`);
    }
  }
  if (new Set(selected).size !== selected.length) {
    throw new Error(`A section is published twice in ${document.path}.`);
  }
  const overview = sections.filter(({ title }) => !selected.includes(title));
  const links = chapters.map((chapter) => {
    // Keep existing deep links useful: they land beside the new page's link.
    const anchors = sections
      .filter(({ title }) => chapter.sections.includes(title))
      .flatMap((section) => section.anchors)
      .map((anchor) => `<span id="${anchor}"></span>`)
      .join("");
    return `- ${anchors}[${chapter.title}](/${chapter.slug}): ${chapter.description}`;
  });
  const navigation = links.length
    ? `\n## In this section\n\n${links.join("\n")}\n`
    : "";

  return [
    {
      ...document,
      document,
      sections: overview,
      anchorTargets: sectionAnchorTargets(overview),
      text: overview.map((section) => section.text).join("") + navigation,
    },
    ...chapters.map((chapter) => {
      const content = sections.filter(({ title }) =>
        chapter.sections.includes(title)
      );
      return {
        ...chapter,
        document,
        sections: content,
        anchorTargets: sectionAnchorTargets(content),
        text: content.map((section) => section.text).join(""),
      };
    }),
  ];
}

async function loadEntries(): Promise<SourceEntry[]> {
  const sources = await Promise.all(
    documents.map(async (document) => {
      const sourcePath = resolve(repositoryRoot, document.path);
      const original = await readFile(sourcePath, "utf-8");
      return preparePages(document, original);
    })
  );
  const pages = sources.flat();
  return pages.map((page) => {
    const linked = rewriteLinks(page, pages);
    const body = withPackageManagerTabs(linked);
    const format = body === linked ? "md" : "mdx";
    return {
      ref: `${page.slug}.${format}`,
      data: { title: page.title, description: page.description },
      body: { format, text: body },
      sourcePath: resolve(repositoryRoot, page.document.path),
      editUrl: `${githubEdit}${page.document.path}`,
    };
  });
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
