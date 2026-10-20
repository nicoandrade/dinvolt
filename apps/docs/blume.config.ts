import { defineConfig } from "blume";
import { custom, filesystem } from "blume/sources";

import { repositorySource } from "./lib/repository-source.ts";

export default defineConfig({
  title: "Dinvolt",
  description:
    "Create your application with Dinvolt: a Next.js foundation, editable UI and context for AI coding agents.",
  content: {
    sources: [filesystem({ root: "content" }), custom(repositorySource)],
  },
  deployment: { site: "https://docs.dinvolt.com" },
  github: { owner: "nicoandrade", repo: "dinvolt", dir: "apps/docs" },
  logo: { image: "/logo.svg", text: "Dinvolt" },
  seo: { og: { image: "/opengraph-image.jpg" } },
  navigation: {
    actions: [{ label: "Website", href: "https://dinvolt.com" }],
    sidebar: [
      "/",
      {
        label: "Get started",
        items: ["/quickstart", "/next-steps", "/project-types"],
      },
      {
        label: "Build with agents",
        items: ["/agents", "/agents/project-prompt", "/agents/skills"],
      },
      {
        label: "Database",
        root: "/guides/database",
        display: "group",
        items: [
          "/guides/database",
          "/guides/database/migrations",
          "/guides/database/environments",
          "/guides/database/turso",
          "/guides/database/planetscale",
          "/guides/database/troubleshooting",
        ],
      },
      {
        label: "Authentication",
        root: "/guides/authentication",
        display: "group",
        items: [
          "/guides/authentication",
          "/guides/authentication/administrators",
          "/guides/authentication/sessions",
          "/guides/authentication/password-recovery",
          "/guides/authentication/configuration",
        ],
      },
      {
        label: "API and data",
        root: "/guides/data",
        display: "group",
        items: [
          "/guides/data",
          "/guides/data/procedures",
          "/guides/data/server-rendering",
          "/guides/data/query-cache",
          "/guides/data/admin-tables",
        ],
      },
      {
        label: "UI",
        items: ["/ui/blocks", "/ui/admin-panel", "/ui/actions"],
      },
      {
        label: "Deployment",
        root: "/guides/vercel",
        display: "group",
        items: [
          "/guides/vercel",
          "/guides/vercel/environments",
          "/guides/vercel/automation",
          "/guides/vercel/configuration",
        ],
      },
      {
        label: "CLI reference",
        root: "/reference/cli",
        display: "group",
        items: [
          "/reference/cli",
          "/reference/create",
          "/reference/setup",
          "/reference/ui-add",
          "/reference/vercel-setup",
          "/reference/json",
        ],
      },
    ],
  },
  theme: {
    accent: { light: "#0069a8", dark: "#ededed" },
    background: { light: "#ffffff", dark: "#000000" },
  },
  footer: {
    copyright: `© ${new Date().getFullYear()} Dinvolt. MIT licensed.`,
    links: [
      { label: "Website", href: "https://dinvolt.com" },
      {
        label: "Changelog",
        href: "https://github.com/nicoandrade/dinvolt/blob/main/CHANGELOG.md",
      },
      {
        label: "Report an issue",
        href: "https://github.com/nicoandrade/dinvolt/issues",
      },
    ],
  },
});
