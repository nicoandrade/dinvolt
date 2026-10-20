---
title: Quickstart
description: Create a Dinvolt project, start it locally and complete optional setup when you are ready.
---

## Requirements

Install **Node.js 24 or later**, **npm** and **Git**. Choose an installed package manager for your generated project. Bun is optional; select npm in advanced configuration if you prefer it.

## Create your project

From the directory where you want to create a new project folder, run:

```sh
npx dinvolt@latest create
```

1. Enter a project name, such as `my-app`.
2. Choose **Create a new folder**.
3. Select **Public website only** or **Public website + administration**.
4. Use **Dinvolt defaults**, or choose **Advanced configuration** to select your package manager, linter, editor settings, UI presets and, for administration projects, database provider.

Defaults use the package manager detected in the destination, falling back to Bun for an empty project. They also select Oxlint + Oxfmt, Universal editor settings and recommended agent skills. Administration projects default to Turso and the development database environment.

You can choose **Complete credentials later** and explore the public page immediately. Database setup is optional during creation.

## Run locally

Enter the generated directory and use your selected package manager:

```sh
cd my-app
npm run dev
```

For Bun, use `bun run dev`; for pnpm, `pnpm run dev`. The generated README gives the commands for your selected configuration.

Open the URL reported by the development server, normally `https://my-app.localhost`. Portless manages local HTTPS and may ask you to trust its certificate on first use.

## Build with your agent

Open the project in your coding agent and describe what you want to build. Have it read the generated `AGENTS.md`, README, integration guides and installed skills before making changes.

To let the agent handle creation too, use the [project creation prompt](/agents/project-prompt).

## Finish optional setup

For a project with administration:

1. Create a database with Turso or PlanetScale, matching the provider chosen during creation.
2. Run `npx dinvolt setup` inside the generated project.
3. Complete the selected database environments and create the first administrator when offered.
4. Restart the development server after environment changes.

See [database setup](/guides/database) and [authentication](/guides/authentication). Password recovery needs Resend and a configured sender; it remains unavailable until those are set.

When you are ready to host the application, publish its Git repository and `main` branch, then follow [Vercel setup](/guides/vercel).

## Create without the wizard

This example creates a public site using npm and the remaining Dinvolt defaults:

```sh
npx --yes dinvolt@latest create --name my-app --location new --project-type public --package-manager npm --json
```

Use a destination that does not already exist. To use an existing empty directory, pass its absolute path with `--cwd` and choose `--location current`.

See the [CLI reference](/reference/cli#non-interactive-creation) for all choices, result states and recovery after partial setup.
