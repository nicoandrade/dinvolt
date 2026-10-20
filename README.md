# Dinvolt

**Build your app. Skip the repetitive setup.**

Create a public website or a full application with administration, plus instructions and skills for your AI coding agent.

[Get started](#get-started) · [Tech stack](#tech-stack) · [Repository](#repository) · [Guides](#guides)

## What you get

- 🚀 **A working starting point** — website, local development tools and code standards.
- 🎨 **Your own design** — editable branding, components and public/admin themes.
- 👥 **Admin essentials** — optional sign-in, user management and CSV exports.
- 🤖 **Context for your agent** — project instructions and curated skills.
- 📂 **Code you control** — read, change and extend everything in your project.

## Tech stack

- **App:** Next.js · React · TypeScript
- **UI:** Tailwind CSS · shadcn/ui · Base UI
- **Development:** Portless · Ultracite (Oxlint + Oxfmt by default)
- **Database:** Drizzle · Turso or PlanetScale Postgres
- **Authentication:** Better Auth
- **API & data:** tRPC · TanStack Query · TanStack Table
- **Forms:** React Hook Form · Zod
- **Email:** Resend · React Email

## Get started

### 1. Create

Use **Node.js 24+**, **npm** and **Git**. No global installation is needed. Choose an installed package manager in the wizard; Bun is optional.

```sh
npx dinvolt create
```

In the wizard:

1. Name your project `my-app` and choose **Create a new folder**.
2. Pick **Public website only** or **Public website + administration**.
3. Use **Dinvolt defaults** with Bun, or choose **Advanced configuration** to select npm or another installed package manager.

You can leave database credentials for later and explore the site immediately.

### 2. Run

```sh
cd my-app
npm run dev
```

With Bun, you can use `bun run dev`. Open [my-app.localhost](https://my-app.localhost). Follow Portless's certificate prompts on first run.

Open the project in Codex, Claude Code or your preferred agent and start building. Your generated README covers customization and setup.

<details>
<summary>Creating projects from an agent or script</summary>

```sh
npx --yes dinvolt create --name my-app --location new --project-type public --package-manager npm --json
```

No prompts; returns JSON. See [all options](docs/cli.md#non-interactive-creation).

</details>

<details>
<summary>Optional global installation</summary>

```sh
npm install --global dinvolt
dinvolt create
```

The global installation also makes `dinvolt setup`, `dinvolt ui add` and `dinvolt vercel setup` available directly. To work on Dinvolt itself, see [Contributing](CONTRIBUTING.md).

</details>

## Next steps

Run these inside your generated project:

| To… | Run |
| --- | --- |
| Finish database/admin setup (administration projects) | `npx dinvolt setup` |
| Add public components | `npx dinvolt ui add button dialog --target public` |
| Add admin components | `npx dinvolt ui add table sheet --target admin` |
| Connect Vercel hosting | `npx dinvolt vercel setup` |

- **Database:** create it with your provider first; `setup` completes credentials and initial tables.
- **Hosting:** publish your repository and `main` first. See the [Vercel guide](docs/vercel.md).
- **Password recovery:** configure Resend and a sender address first.

## Keep a Changelog skill

Dinvolt's **Keep a Changelog** skill reviews changes, chooses a semantic version and updates `CHANGELOG.md` or `CHANGELOG.txt`. It works with any project or stack; no Dinvolt application is required. It follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Install it in any repository from the published GitHub source:

```sh
npx skills add nicoandrade/dinvolt --skill keep-a-changelog
```

To test a local checkout, replace `nicoandrade/dinvolt` with its absolute directory. See the [Skills CLI documentation](https://skills.sh/docs/cli) for installation options.

The skill follows the [Skills authoring format](https://github.com/vercel-labs/skills/blob/main/docs/creating-skills.md). According to the [skills.sh FAQ](https://skills.sh/docs/faq), GitHub installs with CLI telemetry enabled automatically register skills for the directory and leaderboard; there is no separate submission step.

Then ask your agent: “Use keep-a-changelog to review the changes, choose the next version and update the changelog.” You can also request a specific version or only update `Unreleased`. Preparing release files does not publish a release.

New Dinvolt projects receive the bundled skill when skill installation is enabled. The source is [skills/keep-a-changelog/SKILL.md](skills/keep-a-changelog/SKILL.md).

## Repository

- **`src/`** — how the CLI works.
- **`catalog/`** — what generated applications receive.
- **`skills/`** — Dinvolt skills installable in any project.
- **`playground/`** — where we preview and test the UI.

<details>
<summary>Full folder map</summary>

```text
dinvolt/
├── src/                    CLI, wizard and project assembly
├── skills/                 Portable Dinvolt skills
├── catalog/
│   ├── next/               Next.js templates and starter docs
│   ├── database/           Drizzle and database initialization
│   │   ├── turso/          Turso configuration
│   │   └── planetscale-postgres/  PostgreSQL configuration
│   ├── auth/               Authentication, admin setup and email
│   ├── trpc/               API and data queries
│   ├── ui/                 Layouts, themes and branding
│   │   ├── components/     Components, hooks, icons and logos
│   │   └── og/             Social preview templates
│   ├── registry/           Installable Dinvolt blocks
│   └── skills/             Agent skill selections
├── playground/
│   ├── app/                Gallery and preview routes
│   ├── components/         Gallery controls
│   ├── component-examples/ Individual component examples
│   ├── showcase/           Composed UI examples
│   └── public/             Preview assets and mocks
├── scripts/                Build and development automation
│   └── playground/         Synchronization and browser checks
├── tests/                  Automated tests
├── tooling/                Lint and formatting helpers
├── docs/                   Technical guides
├── assets/                 Dinvolt branding
└── .vscode/                Editor settings
```

Generated locally and ignored by Git: `dist/` (CLI build) and `demos/` (test apps and playground runtime).

</details>

## Develop Dinvolt

From the repository root:

| Command | Purpose |
| --- | --- |
| `bun run playground` | Preview components and pages at [localhost:3100/playground](http://localhost:3100/playground). |
| `bun run check` | Check formatting, lint, types, build and tests. |
| `bun run test:e2e` | Run the local generated-app flow with a browser and the internal Turso test database. See [internal E2E instructions](scripts/e2e/README.md). |
| `bun run fix` | Apply formatting and lint fixes. |
| `bun run playground:test` | Run browser checks. |

## Guides

- [CLI reference](docs/cli.md) · [Vercel hosting](docs/vercel.md)
- [Changelog](CHANGELOG.md)
- [Components and blocks](catalog/registry/README.md) · [Playground](playground/README.md)
- [Database](catalog/database/README.md) · [Authentication](catalog/auth/README.md) · [API and queries](catalog/trpc/README.md)

## Contributing

Read the [contribution guide](CONTRIBUTING.md) for local setup and checks. Report vulnerabilities using the [security policy](SECURITY.md).

Dinvolt's own code is available under the [MIT license](LICENSE). Third-party components retain their own terms, including the Nucleo UI icons; see [third-party notices](THIRD_PARTY_NOTICES.md).
