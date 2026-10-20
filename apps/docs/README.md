# Dinvolt documentation

The official English documentation lives in this public repository and is built with [Blume](https://useblume.dev). Its production origin is **https://docs.dinvolt.com**. The private sibling `dinvolt-landing` repository owns https://dinvolt.com.

## Development

Use Node.js 24+ and the repository's Bun version. Install from the repository root; `apps/docs` is a private Bun workspace with the shared root lockfile.

```sh
bun install --frozen-lockfile
bun run docs:dev
```

Open the local URL printed by Blume. The server binds to `127.0.0.1` by default. Run `bun run docs:build` and `bun run docs:preview` to inspect the static production output. `bun run docs:check` runs TypeScript, strict link validation and the production build; it is also included in the repository's `bun run check`.

## Content ownership

- `content/` contains the introduction, quickstart, project types and agent guides.
- `lib/repository-source.ts` publishes an explicit selection of existing public Markdown: the CLI and Vercel references in root `docs/`, database/auth/API guides in `catalog/`, the registry guide and only the copyable section of `docs/agent-prompt.md`. Edit those originals; no second copy is maintained.
- The adapter maps links between selected documents to public routes and other repository Markdown links to GitHub. Edit links point to the original source. It watches the selected sources during local development.
- `blume.config.ts` defines navigation, metadata, the canonical production origin and the theme. `theme.css` sets neutral dark surfaces, text and borders inspired by the Next.js documentation. The docs logo derives from `assets/iso.svg`; keep the copies in `public/` aligned when branding changes.
- Blume discovers only `content/` and the explicit repository selection. Do not point it at the repository root or add maintainer notes, E2E reports, environment files or private test instructions as sources.

Content follows `main`, which can be ahead of npm. Check the published version and help before describing new CLI behavior as available through `@latest`. The landing's copied creation prompt should stay aligned with `docs/agent-prompt.md`.

## Vercel setup

The documentation uses the existing [tipybit/dinvolt-docs project](https://vercel.com/tipybit/dinvolt-docs), connected to `nicoandrade/dinvolt`. Its production branch is `main`, its Root Directory is `apps/docs`, and `docs.dinvolt.com` is assigned and verified. Pushes to `main` build the documentation through the Git integration; npm releases remain a separate process.

Use these settings when auditing or recreating the project:

| Setting | Value |
| --- | --- |
| Root Directory | `apps/docs` |
| Framework Preset | Other |
| Node.js | 24.x |
| Package manager | Bun, as declared in root `package.json` |
| Install Command | `cd ../.. && bun install --frozen-lockfile` |
| Build Command | `bun run build` |
| Output Directory | `dist` |
| Include source files outside the Root Directory in the Build Step | Enabled |
| Production Branch | `main` |
| Production Domain | `docs.dinvolt.com` |

The local `vercel.json` records build, install, output and static content headers. Its headers mirror Blume's generated `dist/vercel.json`: Git-based deployments read the project configuration, not the file inside `dist`. Keep those rules aligned when upgrading Blume so Markdown, text and agent-discovery files retain their correct types and discovery headers.

Keep outside-root access enabled because the site reads reviewed Markdown from the rest of the repository and uses the root workspace lockfile. Assign `docs.dinvolt.com` to this project and apply the DNS record Vercel requests. No routing changes to the landing are needed for the subdomain.

This is a static build: no database, authentication, email or model credentials are required. Blume emits HTML, assets, local search, page Markdown mirrors, `llms.txt`, `llms-full.txt`, sitemap and robots files. The production origin is pinned so canonical and discovery URLs remain stable across previews. Vercel Preview deployments serve their own build; disable public indexing for previews in the hosting settings.

Building locally does not create a Vercel project, assign the domain, change DNS or publish the site. After the first deployment, verify the domain, search, internal links, Markdown URLs and sitemap, then update the landing's documentation link to the live origin.

## Distribution

This workspace is private and has no npm release. Root `package.json` keeps an explicit publication allowlist; `apps/docs`, its generated `.blume` runtime, build output and dependencies stay outside the CLI archive. `bun run check:package` verifies that boundary.
