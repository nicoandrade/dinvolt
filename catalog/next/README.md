# {{PROJECT_NAME}}

This site was initialized with **Dinvolt**. It comes with Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, a public website and an admin panel. Drizzle, Better Auth and tRPC + TanStack Query are already wired up so you can focus on your product.

## Start here

Use **Node.js 24+** and **{{PACKAGE_MANAGER}}**, the package manager selected for this project. Dinvolt has already installed the dependencies. From the project folder, run:

```sh
{{SCRIPT:dev}}
```

Open [your local site]({{DEVELOPMENT_URL}}). Edit `src/app/(public)/page.tsx` to start building your homepage; changes appear as you save. You can explore the welcome page before configuring a database.

The development script uses **Portless** to give your app a stable local HTTPS address. It starts the proxy automatically; no global install or manual port selection is needed. On first run, follow any prompts to trust the local certificate and allow port 443. Keep `BETTER_AUTH_URL` aligned if you change the hostname. See [local development](docs/development.md) for details and certificate troubleshooting.

## Make it yours

Start with these files:

| File | What to customize |
| --- | --- |
| `src/config/site.ts` | Your site name, description, URL, language and locale. These values feed page metadata and social previews. |
| `src/components/logo-iso.tsx` | Your symbol or icon. It also generates the browser icons and appears in social previews. |
| `src/components/admin/logo-complete.tsx` | Your complete logo: symbol and wordmark together, used in the admin panel. |
| `src/app/(public)/page.tsx` | Your homepage content and links. |
| `src/app/globals.css` | Shared styles and the public/admin theme tokens. |

Replace the sample logos with your own SVG artwork. Keep the component exports and SVG props, update each `viewBox` and accessible title, and use `currentColor` where the logo should follow the theme. Keep `LogoIso` compatible with server rendering so icon and social image generation still work. Preview your logos on light and dark backgrounds.

`src/components/admin/logo-iso.tsx` re-exports the shared symbol, so edit `src/components/logo-iso.tsx` to update it everywhere. If you also need a standalone wordmark, add it as `src/components/logo.tsx`; this third variant is not installed by default.

## Connect your database and sign in

Explore the site with your existing dev command first. When you are ready, create a database in Turso or PlanetScale, then run this from anywhere inside the project:

```sh
npx dinvolt setup
```

Setup checks your selected capabilities and existing connections, asks only for missing database fields, initializes only an unchanged initial migration on an empty database, and offers the first administrator only where none exists. You can choose environments to complete or **Add another environment** and leave credentials pending. It preserves existing auth secrets and accounts. It does not provision external services. Restart dev after changing environment variables.

New credentials go to `.env.local` when present, otherwise the existing `.env`, or a new private `.env.local`. Both are parsed as dotenv, never shell code. Inherited and mode-specific `.env*` values take precedence; setup stops before database changes if they override your new credentials. Tracked files require an untracked private destination. Keep these private files out of Git.

### Manual setup

The commands below remain available for explicit manual setup.

**The commands below target development.** If you selected only staging/production, use the corresponding `db:init:staging` / `db:init:production` and `auth:create-admin:staging` / `auth:create-admin:production` scripts instead. Local static pages remain available, but `dev` never connects to staging or production. See [database environments](docs/database.md) before applying changes.

1. If the wizard reported **auth tables ready**, skip straight to administrator creation.
2. Otherwise, create a database with the selected provider and fill in its credentials in the generated `.env.local`. Use `.env.example` as a reference; **do not copy it over `.env.local`**, which already contains your unique `BETTER_AUTH_SECRET`.
3. The initial SQL is already generated in `drizzle/`. Review it, then initialize the empty database (or safely retry initialization):

   ```sh
   {{SCRIPT:db:init}}
   ```

4. Create your first administrator, replacing the example email and name. The command checks the auth schema and generates a 12-character initial password, displayed once in your interactive terminal. Save it to sign in:

   ```sh
   {{CREATE_ADMIN_COMMAND}}
   ```

Visit [the admin login]({{DEVELOPMENT_URL}}/admin) and sign in. Dinvolt can initialize empty connected databases during creation; it does not provision a database service. Administrator creation is an optional step after the authentication tables are ready. For later schema changes, run `{{SCRIPT:db:generate}}`, review the SQL and apply it with `{{SCRIPT:db:migrate}}` for development or the explicit environment command. See [database setup](docs/database.md) and [authentication](docs/auth.md) for more.

## Everyday commands

| Command            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `{{SCRIPT:dev}}`   | Start development with Portless and automatic reloads. |
| `{{SCRIPT:check}}` | Check linting and formatting with Ultracite.           |
| `{{SCRIPT:fix}}`   | Apply lint fixes and formatting.                       |
| `{{SCRIPT:build}}` | Create a production build.                             |
| `{{SCRIPT:start}}` | Serve that build locally with Next.js.                 |

Portless is used by `dev`; `start` serves the built app locally. Neither `NODE_ENV=production` nor a local production build selects the production database. Vercel Preview uses the selected staging database and Vercel Production uses production, with `_STAGING` and `_PRODUCTION` credentials respectively; neither falls back to development. Before deploying, set `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL` to your public origin, configure your database credentials and auth secret in your hosting environment, and apply reviewed migrations. Keep `.env.local` out of version control.

## Publish through Git

Dinvolt initializes a local repository without committing. Review your files, create your remote repository and publish `main` yourself. Existing repositories and branches are preserved. Once the remote is available, run:

```sh
npx dinvolt vercel setup
```

Choose the Vercel team/project, review the hosting and variable plan, and connect Git. The command configures hosting without uploading your local code. Subsequent pushes or merges to `main` trigger production deployments. Saving variables does not update existing deployments. Connecting Git can trigger an initial build of the published commit, so publish only code that is ready for its configured environment.

Prepare production with `npx dinvolt setup` first; prepare staging too if you want Preview. Hosting uses only `_PRODUCTION` / `_STAGING` database keys and separate remote auth secrets. Password recovery email is optional per environment. Production uses your assigned verified domain; authenticated Preview uses its exact deployment URL. Apply reviewed migrations explicitly before a Git build, never in a build script.

For your next feature, see [tRPC and queries](docs/trpc.md). If you work with an AI coding agent, the project's `AGENTS.md` contains its development conventions. This is your project now—adapt this README as it grows.

## Starter notices

Keep `docs/licenses/` and the notices bundled with icons and fonts when redistributing starter code or assets. Dinvolt's own code uses MIT; bundled Nucleo icons retain their separate terms in `src/components/icons/LICENSE.nucleo`. These notices do not choose a license for your application's original code.
