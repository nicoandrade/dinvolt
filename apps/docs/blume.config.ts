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
  navigation: {
    actions: [{ label: "Website", href: "https://dinvolt.com" }],
    sidebar: [
      "/",
      { label: "Get started", items: ["/quickstart", "/project-types"] },
      {
        label: "Build with agents",
        items: ["/agents", "/agents/project-prompt", "/agents/skills"],
      },
      {
        label: "Guides",
        items: [
          "/guides/database",
          "/guides/authentication",
          "/guides/data",
          "/guides/vercel",
        ],
      },
      { label: "Reference", items: ["/reference/cli", "/ui/blocks"] },
    ],
  },
  theme: {
    accent: { light: "#0069a8", dark: "#66c7ff" },
    background: { light: "#ffffff", dark: "#101828" },
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
