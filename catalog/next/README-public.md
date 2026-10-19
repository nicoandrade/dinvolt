# {{PROJECT_NAME}}

This public website was initialized with **Dinvolt**. It includes Next.js App Router, TypeScript, Tailwind CSS and shadcn/ui, ready for a landing page or informational site.

## Start here

Use **Node.js 24+** and **{{PACKAGE_MANAGER}}**, the package manager selected for this project. Dependencies are already installed. From the project folder, run:

```sh
{{SCRIPT:dev}}
```

Open [your local site]({{DEVELOPMENT_URL}}). Edit `src/app/(public)/page.tsx` to build your homepage; changes appear as you save.

The development script uses **Portless** for a stable local HTTPS address. On first run, follow any prompts to trust the local certificate and allow port 443. See [local development](docs/development.md) for details.

## Make it yours

| File | What to customize |
| --- | --- |
| `src/config/site.ts` | Site name, description, URL, language and locale for metadata and social previews. |
| `src/components/logo-iso.tsx` | Your symbol, also used for browser icons and social previews. |
| `src/components/logo-complete.tsx` | Your complete logo, used on the welcome page. |
| `src/app/(public)/page.tsx` | Homepage content and links. Add more pages inside `(public)` as needed. |
| `src/app/globals.css` | Styles and public theme tokens. |

Replace the sample logos with your SVG artwork, preserving exports and SVG props. Keep `LogoIso` compatible with server rendering so icon and social image generation work.

Add components with `npx dinvolt ui add button dialog`; the project defaults to its public shadcn/ui profile. `--target public` also works. The project includes one UI theme and no database, authentication, admin panel or tRPC setup. `npx dinvolt setup` reports that there is nothing to configure for this project type; it does not add backend capabilities.

## Everyday commands

| Command            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `{{SCRIPT:dev}}`   | Start development with Portless and automatic reloads. |
| `{{SCRIPT:check}}` | Check linting and formatting with Ultracite.           |
| `{{SCRIPT:fix}}`   | Apply lint fixes and formatting.                       |
| `{{SCRIPT:build}}` | Create a production build.                             |
| `{{SCRIPT:start}}` | Serve that build locally with Next.js.                 |

Before deploying, set `NEXT_PUBLIC_SITE_URL` to your public origin or update the URL in `src/config/site.ts`. No database credentials or auth secrets are needed. Keep local environment files out of version control.

## Publish through Git

Dinvolt initializes a local repository without committing. Review your files, create your remote repository and publish `main` yourself. Existing repositories and branches are preserved. Once the remote is available, run:

```sh
npx dinvolt vercel setup
```

Choose the Vercel team/project, review the hosting and variable plan, and connect Git. The command configures hosting without uploading your local code. Subsequent pushes or merges to `main` trigger production deployments. Saving variables does not update existing deployments. Connecting Git can trigger an initial build of the published commit, so publish only code that is ready for its configured environment.

Choose an assigned production domain and optionally enable Preview. No database, auth or recovery email configuration is requested.

The project's `AGENTS.md` contains development conventions for AI coding agents. Adapt this README as your site grows.

## Starter notices

Keep `docs/licenses/` and the notices bundled with icons and fonts when redistributing starter code or assets. Dinvolt's own code uses MIT; bundled Nucleo icons retain their separate terms in `src/components/icons/LICENSE.nucleo`. These notices do not choose a license for your application's original code.
