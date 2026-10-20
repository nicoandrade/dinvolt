---
title: Introduction
description: Build your app with a Next.js foundation, editable UI and context for your coding agent.
---

![Dinvolt — build your app with your AI coding agent](/dinvolt-intro.jpg)

Dinvolt creates a working starting point for your application and gives your coding agent the conventions and skills to extend it.

Choose a public website or an application with administration. Both give you source code you can read, change and own, without a Dinvolt account or subscription.

## Start building

- [Quickstart](/quickstart): create your first project and run it locally.
- [Build with an agent](/agents): use Codex, Claude Code, Cursor or another coding agent.
- [Choose your project type](/project-types): decide whether you need administration, authentication and a database.

## What you get

| Area | Foundation |
| --- | --- |
| Application | Next.js, React and TypeScript |
| Interface | Tailwind CSS, shadcn/ui and Base UI |
| Development | Portless and Ultracite, with Oxlint + Oxfmt by default |
| Agent context | Project instructions and recommended skills |
| Optional administration | Better Auth, user management and CSV exports |
| Optional database | Drizzle with Turso Database or PlanetScale Postgres |
| Optional API and data | tRPC, TanStack Query and TanStack Table |
| Optional recovery email | Resend and React Email |

Administration features are included only when you select **Public website + administration**. External databases, hosting and email services require their own setup.

## Continue with your project

Run `npx dinvolt setup` when you have database credentials, [add components](/ui/blocks) as you build, and [connect Vercel](/guides/vercel) when your Git repository is ready.

Dinvolt installs editable application code. Changes to Dinvolt's catalog affect future installations; existing projects keep their own source and customizations.

## About these docs

These docs are maintained alongside [Dinvolt's source code](https://github.com/nicoandrade/dinvolt). The command reference and integration guides reuse the repository's Markdown during the site build.

The reference follows the source on `main`. For commands run through `@latest`, check `npx dinvolt@latest --version` and the command's `--help`: source changes may be ahead of the published package. See the [changelog](https://github.com/nicoandrade/dinvolt/blob/main/CHANGELOG.md) for released changes.
