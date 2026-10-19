# CLI reference

Dinvolt creates Next.js applications, completes database and administrator setup, installs UI components and connects Vercel hosting through Git. Generated applications own their source and do not require a Dinvolt account or subscription.

| Command | Purpose |
| --- | --- |
| `dinvolt create` | Create a public website or a public website with administration. |
| `dinvolt setup` | Complete database credentials, initial tables and the first administrator. |
| `dinvolt ui add <components...>` | Install components or packaged Dinvolt blocks. |
| `dinvolt vercel setup` | Configure Vercel environments and Git integration. |

See the [README](../README.md#get-started) for installation from source. Use `dinvolt <command> --help` for available flags; every command also supports non-interactive execution, documented below.

## Technology

| Responsibility                               | Choice                    |
| -------------------------------------------- | ------------------------- |
| Language                                     | TypeScript                |
| Development dependencies, scripts, and tests | Bun                       |
| CLI build                                    | Bun with `target: "node"` |
| Commands, arguments, and help                | Commander                 |
| Interactive prompts and selections           | `@clack/prompts`          |
| JavaScript distribution runtime              | Node.js                   |

The CLI is built for Node.js. Runtime compatibility checks must execute the compiled output with Node.js; tests with Bun alone do not establish that compatibility.

## Catalog separation

CLI implementation lives in `src/`. The `catalog/` directory contains application templates, UI components and registry blocks, generated project documentation and instructions, and the external skill selection in `catalog/skills/config.json`.

`create` assembles the application from those sources. `ui add` installs components into an existing application's selected UI area. These sources ship with the package; external skills are retrieved through the Skills CLI during creation.

## Requirements and project creation

Using Bun for CLI development does not require users to install Bun unless they select it as the generated application's package manager. `create` checks that Node.js 24 or later and its selected package manager are available before writing files. The other CLI commands require Node.js 22.18 or later, matching Ultracite.

Build and install the CLI from source using the README instructions. Global CLI installation is independent of the project-local skills and configuration created in each application.

`dinvolt create` starts an interactive wizard with four questions:

1. Project name, prefilled with the starting directory's name and editable.
2. Destination: use the current directory or create a child directory with the selected name.
3. Project type: **Public website + administration** is preselected. **Public website only** creates a landing page or informational site without database, authentication, admin routes or tRPC. The selected `projectType` (`public-admin` or `public`) is stored in `.dinvolt/config.json`.
4. Configuration: **Use Dinvolt defaults** is preselected and skips advanced choices. It uses the detected package manager or Bun, Oxlint + Oxfmt, Universal editor settings and automatic installation of relevant agent skills. Projects with administration also use Turso Database with Drizzle. **Advanced configuration** exposes the remaining choices.

Advanced configuration asks for the choices relevant to the project:

- Package manager: Bun, npm, pnpm, Yarn, Deno, Nub or Aube. `nypm`, also used by Ultracite, detects the destination's `packageManager` field or lockfiles. The detected value is preselected; an empty project defaults to Bun. The choice remains editable and applies to the entire starter. Parent directories and the CLI's launch command do not decide the new project's package manager.
- Linter: Oxlint + Oxfmt (default), Biome, or ESLint + Prettier + Stylelint.
- Editor groups: Universal (default) and/or Zed. The selection is optional and supports multiple groups.
- Public website shadcn/ui preset: optional; defaults to `b1aIcEacC`.
- Admin panel shadcn/ui preset (administration only): optional; defaults to `bIkeymG`.
- Database (administration only): Turso Database (default) or PostgreSQL on PlanetScale, both configured with Drizzle ORM and Drizzle Kit.
- Database environments (administration only): any nonempty selection of development, staging and production; development is preselected. Defaults use development only.
- Agent skills: install the recommended skills (default), or skip them to install skills manually later.

For projects with administration, both default and advanced configuration then offer **Complete credentials later** (preselected) or **Connect and initialize databases**. The latter asks for each selected environment's Turso URL/token or PlanetScale application/direct migration URLs. All values are masked, including URLs. Dinvolt assigns unsuffixed development variables and `_STAGING` / `_PRODUCTION` suffixes automatically.

The initial connection probe performs `SELECT 1`, with an 8-second timeout per network operation and connection cleanup; PlanetScale checks both endpoints. Failures show only the provider, environment and variable name, and offer correction, retry or leaving that environment pending. Credentials explicitly skipped after a failed connection probe are discarded; later initialization failures preserve saved credentials. Cancelling any connection prompt aborts before generation. No database services are provisioned. After dependencies are installed, Dinvolt generates one shared initial migration and includes its snapshots in the final formatting and code checks. It then saves the project at its final destination and sequentially initializes empty connected databases. Matching real schema/history is skipped safely; unknown or incompatible existing structure remains pending without deleting or adopting data. Connection alone does not prove readiness; auth tables and columns are verified before reporting ready.

Connected values are written at the end of generation to the ignored `.env.local`, with private file permissions and safe dotenv serialization, preserving the generated `BETTER_AUTH_SECRET` and other variables. They are never passed to installer subprocesses, printed in summaries or copied into `.env.example`. The final summary reports connection and auth-table readiness per selected environment. Remote failures preserve the project, credentials and initial migrations. Complete pending credentials in `.env.local` and retry the unchanged initial migration with `db:init[:staging|:production]`; future changes use reviewed `db:generate` / `db:migrate` commands.

For administration projects, before the preset questions, the wizard displays separate shadcn/ui Create links preloaded with the default [public preset](https://ui.shadcn.com/create?preset=b1aIcEacC) and [admin preset](https://ui.shadcn.com/create?preset=bIkeymG), using `?preset=<code>`. Both fields accept a bare code (`b0`) or a copied option (`--preset bImMZYe`), trim whitespace, and validate using the pinned shadcn preset decoder. Empty answers keep the respective defaults. Invalid input stays in the prompt; cancelling writes nothing. The summary includes both chosen codes. Default configuration skips these questions and keeps the corresponding Dinvolt presets. Public-only projects show only the public preset link and field, store only that preset, and generate no admin profile, theme selectors or layout. Their `components.json` and `ui add` default to public.

`--cwd <directory>` changes the starting directory. The project name must be a lowercase package name. Selecting the current directory preserves its folder name and accepts only an empty directory, apart from `.git` and `.DS_Store`. Selecting a new directory creates it only after all answers and refuses an existing destination. Cancelling any prompt writes nothing.

`create-next-app` (`16.4.2`) and Ultracite (`8.0.1`) are exact runtime dependencies, resolved from Dinvolt's installed package and executed as child processes without a shell. Their resources remain in their packages instead of being bundled into the CLI JavaScript.

Child processes default to captured stdout/stderr with stdin closed because all options are supplied up front. Dinvolt uses Clack's built-in animated spinner for each creation, installation and verification step, preserving the wizard guide without additional spinner dependencies. Each spinner stops on completion or failure. Failed commands retain the last 64 KiB of diagnostics, strip terminal control sequences, and display the error through Clack in interactive terminals. Plain-text non-interactive errors remain on stderr; `create --json` emits structured errors on stdout. Explicit inherited or ignored stdio remains available to internal callers.

Fixed starter options:

```text
--ts --tailwind --cache-components --no-linter --app --src-dir --empty
```

Additional flags prevent another wizard and make the remaining choices explicit: `--yes --no-react-compiler --import-alias @/* --agents-md --no-agent-feedback --disable-git`. This avoids inheriting a user's saved generator preferences and prevents create-next-app from creating an automatic commit. Dinvolt initializes an uncommitted `main` repository after the project is saved, unless the destination already has a Git repository or worktree marker.

`prepareStarter` adds the pinned `portless@0.15.8` development dependency before installation and sets the generated project's Node.js engine to `>=24`. The `dev` script runs `portless <project-name>.localhost next dev`, using an explicit hostname so folder names, Git worktree prefixes and Portless command names cannot change the origin. It follows Portless's DNS normalization: dots and underscores become hyphens; labels longer than 63 characters are shortened with a six-character hash. The shared URL helper supplies the same HTTPS origin to both Better Auth environment files, the generated README, `docs/development.md` and the wizard's completion note. Next.js respects Portless's assigned `PORT` and already allows `.localhost` origins. Portless handles local CA trust and HTTPS port 443 on first development run; `create` does not start a proxy or change system trust. See the [Portless guide](https://portless.sh/).

Next.js writes the template with `--skip-install`. For Bun, npm, pnpm and Yarn it receives the corresponding `--use-*` option. Other managers use the npm template without installation. Dinvolt sets the actual selected manager and installed version in `package.json`, then lets Ultracite install all dependencies using that manager, producing its lockfile. Bun is not needed when another manager is selected.

Dinvolt also replaces the generator's TypeScript dependency with `^7.0.2` before Ultracite installs dependencies, so the manifest and lockfile both use TypeScript 7. This permits compatible updates within version 7. Next.js 16.4.2 uses the project-local `tsc` CLI by default and needs no additional TypeScript configuration; see [Using TypeScript 7](https://nextjs.org/docs/app/api-reference/config/typescript#using-typescript-7).

For ESLint only, typescript-eslint still requires the classic compiler API. Dinvolt follows [Microsoft's side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0): `typescript: npm:@typescript/typescript6@^6.0.2` provides that API and `@typescript/native: npm:typescript@^7.0.2` provides the TypeScript 7 `tsc` executable. This keeps ESLint operational while Next.js and direct `tsc` checks use version 7.

Ultracite runs with `init --yes --quiet --pm <manager> --linter <linter> --agents universal --frameworks react next`, plus `--editors` when editors were selected. Its universal agent instructions are added to `AGENTS.md`, preserving the Next.js block and existing project instructions. This is independent of the editor selection. `--js-plugins @shadcn/lint` is passed only for Oxlint. Dinvolt does not implicitly enable hooks, Git integrations or type-aware linting. Project skill installation is handled separately after the code checks.

Editor groups follow Ultracite's settings-file grouping: Universal writes `.vscode/settings.json` for VS Code, Cursor, Devin Desktop and other VS Code-based editors; Zed writes `.zed/settings.json`. `.dinvolt/config.json` stores `schemaVersion`, `packageManager`, `editors`, and the chosen Ultracite version, linter, agents, frameworks and JS plugins. The top-level editor selection is reusable by other integrations.

Generation takes place in a system temporary folder outside the destination's repository, using the chosen project name as the generated folder's basename. This keeps the package name consistent even when the current directory has another name and prevents parent ignore rules from excluding all files during linting. Dinvolt overlays the minimal page, layout and Next.js configuration from `catalog/next/`, then runs Ultracite's `fix` and `check` commands. Files are moved into the destination only after successful generation, installation and checks. Cross-volume transfers copy entries while preserving relative dependency symlinks. Dinvolt initializes Git after moving the project to its final destination; a destination's existing `.git` directory or worktree marker is preserved instead. Errors remove temporary files; an empty new destination is also removed. Existing or concurrently added files are preserved, and errors do not report success.

### Project agent skills

`create` installs project-local skills by default. The advanced wizard asks whether to install them, with Yes preselected; No skips all skill commands and downloads. The summary lists the selected skills or states that installation is manual. `.dinvolt/config.json` records `skills.enabled` and the selected `skills.sources`.

`catalog/skills/config.json` is the source of truth. Its `always` groups list the five common skills: `vercel-react-best-practices`, `web-design-guidelines`, `agent-browser`, `shadcn`, and `transitions-dev` (from `Jakubantalik/transitions.dev`). Only projects with administration include the `admin` group (`better-auth-best-practices` and `better-auth-security-best-practices`) and the `database` groups, which add `turso-db` for `turso`, or `postgres` for `planetscale-postgres`. Add, remove or change repository/name pairs there; database keys are checked against the supported providers by TypeScript.

`src/skills.ts` resolves the selection and runs the pinned `skills` CLI (`1.5.18`, compatible with Dinvolt's Node.js 22.18 minimum) through Node.js without a shell. Each repository is installed sequentially with explicit `--skill <names...> --agent universal claude-code --yes --copy` options. No global scope or machine-dependent agent detection is used. Codex and Cursor use the `.agents/skills/` copy; Claude Code receives an independent copy in `.claude/skills/`. This is independent of the selected editor groups and package manager.

The generated linter and formatter configurations exclude `.agents/skills/**` and `.claude/skills/**`, preserving upstream instructions, scripts and examples when developers run project checks. Skill installation runs after Ultracite's checks so upstream content is preserved without formatting it. The Skills CLI writes `skills-lock.json` with sources and content hashes. Dinvolt verifies a nonempty `SKILL.md` for each selected skill in both destinations and a matching source/hash entry in the lock, since the upstream CLI can exit successfully after a partial installation. A missing skill, incomplete lock or command failure aborts generation and removes the temporary project. Skills and the lock move with the generated application as ordinary files.

Generated projects can update with `npx skills update` or add skills using `npx skills add <owner/repo> --skill <name> --agent universal claude-code --yes`. Commit the installed directories and lockfile to share them. The CLI version is pinned, while skill content is fetched from upstream at creation time and recorded by hash.

### Non-interactive creation

`dinvolt create` keeps the interactive wizard when stdin/stdout are terminals. `--no-input`, `--json`, missing TTY, or `CI=true` / `CI=1` selects non-interactive execution. When passing creation choices in an interactive terminal, include `--no-input` or `--json`; choices are never silently ignored by the wizard. `setup`, `vercel setup` and `ui add` also support `--no-input` and `--json`; see their command sections below.

```sh
# Public site with Dinvolt technical defaults.
dinvolt create --name my-site --location new --project-type public --json

# Administration, explicit advanced choices, credentials deferred.
dinvolt create --name my-app --location new --project-type public-admin \
  --package-manager pnpm --linter biome --editors universal,zed \
  --public-preset b0 --admin-preset bIkeymG \
  --database turso --database-environments development,staging \
  --no-skills --no-input
```

Non-interactive input uses the wizard's defaults, option catalogs, preset validation and generation pipeline. `--name` and `--project-type` are required so automation does not silently choose a product type. Other choices are optional:

| Option | Values / default |
| --- | --- |
| `--cwd` | Existing starting directory; defaults to `.` |
| `--location` | `current` (default), `new`; existing destinations are protected |
| `--project-type` | `public`, `public-admin` |
| `--package-manager` | `bun`, `npm`, `pnpm`, `yarn`, `deno`, `nub`, `aube`; detected in destination, otherwise Bun |
| `--linter` | `oxlint` (default), `biome`, `eslint` |
| `--editors` | Comma-separated `universal`, `zed`; `none` disables editor settings; default `universal` |
| `--public-preset`, `--admin-preset` | shadcn preset codes; defaults to the respective Dinvolt presets |
| `--database` | `turso` (default), `planetscale-postgres` |
| `--database-environments` | Comma-separated `development`, `staging`, `production`; default `development` |
| `--skills`, `--no-skills` | Install recommended project skills (default), or skip installation |
| `--connect` | Comma-separated subset of configured environments; omitted means defer all connections |
| `--credentials-file` | Private JSON object containing database environment variables; required with `--connect` |
| `--admin-environments` | Comma-separated subset of connected environments; omitted means defer administrator setup |
| `--admin-name`, `--admin-email` | Required with `--admin-environments` |
| `--admin-output` | New private JSONL file outside the generated project; required with `--admin-environments` |

Public-only projects reject database and administrator flags. Invalid selections and missing inputs stop before project creation. No-input operation never invokes a prompt; subprocess stdin remains closed, with all installer choices supplied explicitly. Failed connection probes stop with an actionable error instead of asking to edit/retry/skip; correct the file or omit that environment from `--connect` and rerun.

#### Credentials and optional administrator

Use a private JSON file outside version control. It contains exact variable names, for example `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for development, with `_STAGING` or `_PRODUCTION` appended for other environments. PlanetScale uses `DATABASE_URL` and `DATABASE_URL_DIRECT`, with the same suffix convention. Only keys for explicitly connected environments are used; there is no ambient credential fallback. Never put credential values in command arguments or commit the file.

```sh
dinvolt create --name my-app --location new --project-type public-admin \
  --connect development --credentials-file /private/path/database.json \
  --admin-environments development --admin-name "Project Admin" \
  --admin-email admin@example.com --admin-output /private/path/new-admin.jsonl \
  --json
```

`--connect` explicitly requests the same connection and initial database preparation offered by the wizard. Database initialization runs sequentially after local generation is durable, inspects real schema/history, and leaves incompatible databases pending without applying schema changes. Effective dotenv/inherited credentials must match the supplied values before any remote mutation. Databases are not provisioned and later migrations are not applied automatically.

`--admin-environments` requests first-administrator creation only in ready environments. Existing administrators are preserved. The output file is created exclusively with mode `0600` before account writes; existing files and symlinks are refused. Each newly created password is written and flushed immediately as one JSON line containing `environment`, `email` and `password`. Passwords never enter stdout/stderr or the result JSON. Development credentials are also saved in the project's ignored private dotenv file, as in the wizard. Keep or securely remove the external private files yourself. When all selected environments already have an administrator, the output file is empty and the result reports `existing`.

#### JSON contract and recovery

`--json` implies `--no-input`. Stdout contains exactly one JSON object followed by a newline. Progress is plain text on stderr, and child-process output is captured. Parser errors (unknown options, invalid values and missing option arguments) also use this contract. `--help` and `--version` retain standard text output.

The result has `schemaVersion: 1`, `command: "create"`, `status`, `project` (`null` until the project is durable), resolved `configuration`, `completedSteps`, `database`, `administrators` and `nextSteps`. Failed input may have no resolved configuration. Errors include `error.code` (`INVALID_OPTIONS`, `CREATE_FAILED`, `CANCELLED`) and `error.message`; option validation can also include `field` and `choices`. Administrator output is identified by `credentialsFile`, without its contents.

- `completed`: the project and requested setup are complete.
- `needs-attention`: the project exists but database/administrator work remains. Per-environment entries distinguish deferred credentials from failed/incompatible initialization, and administrator `pending`, `existing`, `created` or `failed` states.
- `failed`: an operation failed; inspect `project` before retrying. A failure after local generation preserves the project and reports its path.
- `cancelled`: interruption was observed; inspect persisted state before retrying.

Exit code `0` means creation succeeded, including deliberately deferred connection/admin setup. Exit code `1` means invalid input, generation failure or requested remote setup did not complete. Observed interruption uses `130`. `completedSteps` records finished generation stages, which may have run in a temporary directory; it does not imply those files survived a later failure. `project` is the durability indicator. Existing destination files are never overwritten. Continue an existing project with `dinvolt setup` rather than rerunning `create` on it.

For agents: reuse decisions already stated by the user. Ask about unresolved product choices such as whether administration is needed; use documented technical defaults when appropriate. Pass explicit parameters, inspect the JSON status and per-environment outcomes, and use `project.path` for subsequent work. A pending connection is not a failed project creation. Only request database or account writes when those operations are within the user's requested scope.

### Database setup

This section applies only to projects with administration. Public-only creation skips connection prompts, migrations, initialization and first-administrator setup entirely. Its generated README, development guide and agent instructions cover only the public site, and its welcome page has no admin link.

After the preset questions, advanced configuration offers Turso Database (preselected) or PostgreSQL on PlanetScale. An additional advanced multiselect chooses database environments (development, staging, production), requires at least one and preselects development. Default configuration uses Turso Database with development only; both modes offer optional connection setup. The chosen provider, normalized `environments` and `orm: "drizzle"` are stored in `.dinvolt/config.json`, and the summary names the database.

Before the one dependency installation, `prepareDatabaseStarter` copies provider-specific `src/db/index.ts`, `src/db/schema.ts`, `drizzle.config.ts` and `.env.example`, adds `docs/database.md` and the `db:generate`, `db:migrate`, `db:check` and `db:studio` scripts, and appends a short database block to `AGENTS.md`. That block names only the selected provider, identifies `getDb()` and links to the database guide. Existing destination files and conflicting scripts cause an error before writes. The `.gitignore` preserves credentials while allowing `.env.example` to be tracked.

Turso Database uses `@tursodatabase/serverless` and `drizzle-orm/tursodatabase-serverless`, with Drizzle ORM and Kit pinned to `1.0.0-rc.4` as required by the [official integration](https://orm.drizzle.team/docs/sqlite/connect-turso-serverless). It connects over HTTP with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, the `turso` Kit dialect and SQLite table definitions. Kit normalizes `turso://` URLs to HTTPS because this RC bundles an older serverless SDK; `file:` URLs are not supported. The legacy `@libsql/client` is not installed. PlanetScale Postgres retains stable Drizzle ORM `^0.45.4` and Kit `^0.31.11` and uses `pg`, `@vercel/functions` and `drizzle-orm/node-postgres`. `DATABASE_URL` points to PgBouncer on port 6432; `DATABASE_URL_DIRECT` is used by Kit for migrations/Studio on port 5432. Example connection strings preserve TLS certificate verification. This follows [PlanetScale's Vercel Fluid Compute recommendation](https://planetscale.com/docs/postgres/connecting/neon-serverless-driver).

The connection module is guarded by `server-only` and exposes lazy `getDb()` from `@/db`. Turso reuses its HTTP client; PlanetScale reuses a process-global `pg.Pool`, created and registered exactly once with `attachDatabasePool` before Drizzle is initialized. Postgres uses `max: 5`, `connectionTimeoutMillis: 10000`, `idleTimeoutMillis: 5000`, and an idle-error listener. The helper integrates idle cleanup with Vercel's lifecycle; it does not close the whole pool after each request. Drizzle's interactive transactions acquire and release their own clients. Keep this module in the Node.js runtime, use Fluid Compute in the Vercel project, and do not create/end pools per request. The wizard does not configure Vercel hosting settings.

Define and export tables in `src/db/schema.ts` and include tables in its exported `schema` object for typed queries. Turso v1 initializes `defineRelations(schema)` in the connection module; PlanetScale includes stable Drizzle relations in its schema object. The initial schema has no domain tables.

`src/db/environment.ts` resolves an explicit `DINVOLT_DATABASE_ENV` first, then Vercel production/preview as production/staging, otherwise development. It validates selected environments and requires exact credential names, without fallback; `NODE_ENV` does not select a database. Client caches are separated by environment. The generated `.env.example` and private `.env.local` include only selected database variables, with `_STAGING` / `_PRODUCTION` suffixes for nondevelopment destinations.

`with-database-env.mjs` executes selected operations without a shell and overrides inherited selectors. `dev` and unsuffixed migration/Studio/auth scripts force development; selected staging/production variants target their named destination. The wrapper resolves installed package binaries and runs them through Node, including on Windows. Kit uses `@next/env` with development file mode for development and production file mode for staging/production; inherited values retain Next's precedence, test mode keeps Next's test-file behavior, and explicit script targets survive loading. Generation/checking need no credentials. Projects without development can use static local pages and schema generation but fail on local DB access; they use named migration/admin/auth-generation scripts. Keep one reviewed schema/migration directory for all environments. The wizard does not provision database services. Optional initialization applies only the known initial migration after the project is saved; later migrations require explicit review and execution. The generated database guide describes Vercel scoping, preview sharing, auth configuration and recovery requirements.

### Authentication setup

Every new starter with administration runs `prepareAuthStarter` after database preparation and before the single dependency installation. It installs Better Auth, its Drizzle adapter and the official `auth` CLI at the same pinned version. `better-auth/minimal` enables email/password, the Admin plugin and finally `nextCookies()`. The adapter uses `sqlite` for Turso Database or `pg` for PlanetScale Postgres. Postgres enables transactions; Turso retains Better Auth's default nontransactional mode because the pinned Drizzle driver's transaction API shares one HTTP stream and does not isolate overlapping transactions.

The server-only `src/lib/auth.ts` exports lazy `getAuth()`; the shared factory/options live in `src/lib/auth-config.ts`. The React client at `src/lib/auth-client.ts` includes `adminClient()`. `src/app/api/auth/[...all]/route.ts` mounts lazy GET/POST handlers through `toNextJsHandler`. Static welcome pages and builds work without auth/database credentials. The packaged `@dinvolt/admin-panel` block adds `/admin` and protected `/admin/home` and `/admin/users` routes after dependencies are installed. The login uses React Hook Form, Zod, Field components and the existing Better Auth client; it does not create a tRPC login procedure. Server session/role reads are request-scoped and isolated under narrow Suspense boundaries; static UI renders outside those waits. Anonymous login rendering and builds do not require database credentials. Future protected operations must call `requireAdmin` or the matching protected tRPC procedure.

The schema in `src/db/auth-schema.ts` includes the official generator's user, session, account and verification tables and the Admin role/ban/impersonation fields, with provider-specific types, indexes and cascading user references. `src/db/schema.ts` keeps the auth tables in the shared schema. The database's internal connection factory moves to `src/db/connection.ts`; the `@/db` entry point retains its `server-only` guard. Root `auth.config.ts` loads Next.js environment files and shares these internal factories for CLI use, without removing the application's guards.

`.env.example` adds a blank `BETTER_AUTH_SECRET` and the project's `https://<project-name>.localhost` Portless origin as `BETTER_AUTH_URL`. For starters with administration, Dinvolt generates 32 cryptographically random bytes with Node.js and creates `.env.local` from that template with the generated secret and owner-only read/write permissions (`0600`). It explicitly ignores `.env.local` in Git and never prints the secret. Existing local environment files cause setup to stop before writing; failed preparation removes the newly generated file. The completion note points to the local environment, `docs/auth.md` and the migrations guide. Users confirm the wizard reported auth tables ready, or complete pending credentials and run `db:init`, then run `auth:create-admin` to create the first administrator through Better Auth's server-side Admin API. The local interactive command checks every auth table/column without reading records, asks for name/email, generates a cryptographically random 12-character initial password, and displays it only after successful creation. It rejects duplicate emails and never changes existing passwords/roles. Missing auth schema gives the selected environment's migration command; connection failures remain distinct. Administrator creation never applies migrations and never passes its generated password as a process argument. The CLI displays it once after successful creation. New sign-ups receive `user`; there is no public admin bootstrap endpoint. `auth:generate` regenerates the auth schema, adapting legacy relations imports for Turso's Drizzle v1 and removing generated inline purity comments for compatibility with Ultracite. `auth:generate` runs the pinned CLI through `scripts/auth-cli.mjs`; administrator creation uses `scripts/create-admin.mjs` and loads the shared configuration through Jiti with the project's TypeScript paths.

`.dinvolt/config.json` records the authentication provider/version, email/password and plugins. `AGENTS.md` names Better Auth and its enabled features, points to the existing helpers and links to `docs/auth.md` for sessions, permissions and schema changes. Custom protected pages must validate sessions and roles on the server; cookie presence and client checks do not grant access. The Admin plugin enforces its own endpoint permissions. Remote database services are not provisioned by `create`; the optional connection choice initializes only the known initial migration after the project is saved.

### tRPC and TanStack Query

`prepareTRPCStarter` runs after Better Auth and before the single dependency installation. It adds matching pinned tRPC server/client/TanStack integration packages, TanStack Query, SuperJSON and Zod. The public and admin root layouts gain `TRPCReactProvider` while retaining their independent themes and root HTML elements. Existing routes, router files and customized layouts are preserved through preflight checks; failed preparation restores original files.

The `src/trpc/` directory separates lazy request context, procedure helpers, routers, the QueryClient factory, the React provider and RSC helpers. Better Auth receives the actual request headers once per context when a protected procedure needs a session. `protectedProcedure` rejects missing/banned sessions; `adminProcedure` additionally checks the exact comma-separated admin role. Each procedure remains responsible for resource ownership and tenant rules. Database access uses lazy `ctx.getDb()`, keeping public health queries and welcome-page builds independent of database credentials.

The GET/POST fetch adapter at `/api/trpc/[trpc]` emits no-store responses and enforces same-origin POST requests. The router starts with `health`, `auth.me` (safe user fields only) and `admin.status`. Server-only modules cannot be imported into client bundles; AppRouter is a type-only client import. Unexpected internal errors and stacks are not exposed in HTTP results; Zod validation errors retain useful field details.

The browser keeps a stable QueryClient; RSC helpers use React `cache` to share a client only within one render request. Pending queries can stream through dehydration, and SuperJSON handles HTTP and hydration values consistently. `getCaller` executes procedures directly on the server. With Cache Components, await `connection()` inside Suspense before prefetch/hydration; TanStack timestamps need this request-time boundary even for public queries. Keep private data outside shared Next.js caches. `resetQueryCache` cancels in-flight browser queries and clears data before full navigation after identity changes; normal mutations invalidate relevant keys.

The CLI summary names the integration and the completion message links `docs/trpc.md`. `.dinvolt/config.json.api` records tRPC and TanStack versions. The marked `dinvolt-trpc` block in `AGENTS.md` identifies the existing client/server helpers and links to the integration guide for queries, mutations and caching. The installed Next.js documentation remains the primary reference for framework APIs and conventions; the existing Next.js instructions are preserved. Dinvolt's database, auth and tRPC blocks provide concise project context while their guides retain the implementation details. Reference: [official tRPC App Router setup](https://trpc.io/docs/client/nextjs/app-router-setup).

### shadcn/ui profiles and component installation

Every new starter renders transparent PNG icons from `src/components/logo-iso.tsx` through Next.js `ImageResponse`. `src/app/icons/[variant]/route.tsx` prerenders four variants with `generateStaticParams`: `light.png` and `dark.png` (32×32 favicons), plus `apple-light.png` and `apple-dark.png` (180×180). Shared `src/lib/icons.ts` metadata declares separate `prefers-color-scheme: light` and `dark` links for both icon types: black ISO for light, white ISO for dark. Both public and admin layouts use it. The scheme follows the browser/system preference. The starter removes create-next-app's static `favicon.ico` so it cannot compete with these links. There are no copied logo images or regeneration scripts: edit `src/components/logo-iso.tsx` using a self-contained SVG with `currentColor` and a suitable `viewBox`, then rebuild to update icons, OG images and the admin brand. Apple launchers may apply their own background and may not honor media queries.

`catalog/ui/` contains the output of the pinned official `shadcn@4.22.0 init --defaults --preset ...` command for public preset `b1aIcEacC` and admin preset `bIkeymG`. These select Base UI Luma/blue and Base UI Vega/neutral respectively, both with Lucide icons and Inter. The Inter CSS token is corrected to a literal `Inter Variable` font family and fonts are provided locally by `@fontsource-variable/inter`; no Google Fonts request is needed during builds.

New starters centralize public identity in `src/config/site.ts`: the exact wizard project name, description, public origin, HTML language and Open Graph locale. Public home content, browser titles, social metadata and generated OG images reuse this configuration. Public child pages receive a `%s | Site name` title template; admin titles also include the site name and request `noindex, nofollow`. The config is safe to import in client components and performs no session or database reads. Existing configurations are never overwritten by automatic UI preparation.

During creation, `prepareUIStarter` installs those templates before Ultracite performs the one dependency installation using the selected manager. The source and dependency metadata are stored in `.dinvolt/ui/config.json`. Each area has a standard shadcn configuration:

- `.dinvolt/ui/admin.json`: components at `@/components/admin`, UI dependencies at `@/components/admin/ui`, hooks at `@/hooks/admin`, CSS at `src/app/globals.css`.
- `.dinvolt/ui/public.json`: components at `@/components`, UI dependencies at `@/components/ui`, hooks at `@/hooks`, CSS at `src/app/globals.css`.

For a custom preset, Dinvolt uses the pinned shadcn package's public registry API to resolve the official `/init` payload, matching the CLI's preset parameters with the existing Base UI foundation. The returned configuration controls style, base color, icons and menu settings; its light/dark variables replace only the selected area's blocks. Font registry items provide the self-hosted Fontsource imports and family names, including an independent heading font. Dependencies join the starter manifest before the single Ultracite installation. The selected preset codes stay in `.dinvolt/ui/config.json`; generated UI instructions in `AGENTS.md` are shared across presets. Lookup failures happen before any UI files are changed. Future component additions use these generated profiles.

Both use the shared `@/lib/utils` utility. The root `components.json` initially mirrors admin. Both root layouts import the same `src/app/globals.css`: public light/dark variables are under `:root` and `.dark`, while admin variables are under `.admin-panel` and `.dark .admin-panel, .admin-panel.dark`. Tailwind's token mapping is declared once. `--font-body`, `--font-title` and `--radius` can be customized independently in each area. The admin root layout puts `admin-panel` on `<html>`, so portals mounted under `<body>` inherit its tokens. `/` remains in `(public)` and `/admin` in `(admin)`; crossing these root layouts performs a full page load.

New starters also generate 1200×630 Open Graph images using Next.js [`opengraph-image.tsx` and `ImageResponse`](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image). The public image at `src/app/(public)/opengraph-image.tsx` uses the chosen project name; `src/app/(admin)/admin/opengraph-image.tsx` includes `Admin Panel` and the site name and remains accessible without authentication. Placing the admin image under the real `admin` segment avoids a URL collision between route groups. Both use `src/lib/og-image.tsx` for the black background, white isotipo and title, using the shared `src/components/logo-iso.tsx` component and local Inter Bold font assets (including its OFL license) in `assets/og/`. Next.js supplies the image metadata tags and generates/caches these images without database access or external font requests. Both image titles read the site name from `src/config/site.ts`; the admin image prefixes it with `Admin Panel`. Both layouts set `metadataBase` from `siteConfig.url`, which reads `NEXT_PUBLIC_SITE_URL` with the project's Portless origin as its default. Set the public origin before building for deployment; `BETTER_AUTH_URL` remains a separate authentication setting.

```bash
dinvolt ui add button
dinvolt ui add button dialog input --target admin
dinvolt ui add button --target public
dinvolt ui add button --target admin --overwrite
```

The project UI settings select the default target: `public` for public-only projects, `admin` for administration projects. Older projects without those settings keep the `admin` default. Explicit `--target admin` is rejected for a public-only project before installation; Commander validates target choices and requires at least one component. It accepts official registry component names and packaged `@dinvolt/` blocks; arbitrary URLs and third-party registry items are rejected. `--cwd` selects the project root. The command supplies `--yes` and uses the project's package manager through the official CLI, preserving existing components unless `--overwrite` is supplied.

The official CLI has no flag for choosing an alternative config file. Dinvolt serializes operations with `.dinvolt/ui/.lock`, stores a backup of the root config there, activates the selected profile as `components.json`, runs the official CLI, saves configuration updates to that profile, then restores the original root file byte for byte. An originally absent root file stays absent. Errors restore the root config and release the lock; generated components or installed dependencies may remain after a failed upstream operation, following the CLI's normal behavior. A forcibly killed process may leave the lock and backup: verify no UI operation is still running, inspect `state.json`, restore the backup (or remove the temporary root config when `hadComponentsConfig` is false), then remove the lock directory before retrying. A failed restoration deliberately keeps that backup.

For the shared stylesheet, Dinvolt extracts only the chosen area's token blocks into `.lock/theme.css`, presenting them as `:root` and `.dark` to the official CLI. PostCSS merges the resulting tokens into the selected public or admin selectors in `globals.css`, preserving the other area's values. Common imports, Tailwind mappings and registry utilities remain shared. The temporary CSS path is never saved in the project's profile. Concurrent edits to `globals.css` cause the operation to stop without overwriting those edits. Older profiles with separate stylesheet paths keep their existing behavior.

An older, untouched Dinvolt starter can be prepared automatically on its first `ui add`. Preparation checks the original welcome page, layout and CSS and all destination files before writing. Existing custom applications or shadcn setups are not overwritten and receive an actionable migration error.

The generated source under `src/components/ui/**`, `src/components/admin/ui/**`, the two `use-mobile.ts` hooks and `src/lib/utils.ts` retain upstream conventions and are excluded from application linting and formatting. `configureUIStandards` extends Oxlint/Oxfmt ignore patterns, Biome `files.includes`, or ESLint global ignores and `.prettierignore` without disabling the rules for application code. TypeScript still checks all source files. The shadcn usage plugin remains enabled for Oxlint application code.

Preparation appends a short marked `dinvolt-ui` block to `AGENTS.md`: install components with Dinvolt from the project root, choose the public or admin target, and keep imports and themes scoped to that area. These always-applicable project rules live directly in `AGENTS.md`; longer, task-specific workflows can be added as skills separately. Existing instructions are preserved; Ultracite subsequently appends its own instructions as before.

For ESLint, the starter retains Ultracite's core, React and Next.js presets and adds two compatibility settings in `catalog/next/eslint.config.mjs`: `arrow-body-style` is disabled in favor of Unicorn's conflicting `consistent-arrow-return-style` rule, and `unicorn/default-export-style` requires separate arrow function declarations to match React's component convention. The [Unicorn return-style documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-arrow-return-style.md) explicitly advises against enabling both return-style rules together.

The generated application includes the default Next.js agent instructions, the shadcn/ui profiles for its selected project type, and the selected external skills unless installation was disabled in advanced configuration.

## Command scope

- `create` generates the selected public or public/admin application, tooling, project instructions and optional external skills.
- `setup` completes existing database and administrator capabilities; it does not add a backend to public-only projects.
- `ui add` installs shadcn/ui components and packaged Dinvolt blocks into the selected public or admin area.
- `vercel setup` configures hosting and Git integration. It can create a Vercel project, but does not create a Git repository, provision databases or upload local source.

See the [README](../README.md#develop-dinvolt) for repository checks and the [Vercel guide](vercel.md) for hosting requirements.

## References

- [Next.js: create-next-app options](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
- [Ultracite: setup and CLI options](https://www.ultracite.ai/docs/setup).
- [Ultracite: CLI dependencies](https://github.com/haydenbleasel/ultracite/blob/main/packages/cli/package.json).
- [Ultracite: building for Node.js with Bun](https://github.com/haydenbleasel/ultracite/blob/main/packages/cli/build.ts).
- [Clack: interactive prompts](https://github.com/bombshell-dev/clack/tree/main/packages/prompts).
- [npm: defining commands with `bin`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin).
- [shadcn: catalog content authentication](https://ui.shadcn.com/docs/registry/authentication).
- [Skills: installation directories by agent](https://github.com/vercel-labs/skills/blob/main/src/agents.ts).

## Packaged application registry

`catalog/registry/registry.json` declares the own-source blocks. `bun run build` runs the pinned shadcn registry builder with `catalog/registry` as its cwd and writes payloads with content into `dist/registry/`. Both paths are covered by the existing publication allowlist. The namespace `@dinvolt/` resolves only to known packaged items; arbitrary registry URLs and filesystem paths are not accepted.

`create` with administration installs `@dinvolt/admin-spinner` and `@dinvolt/admin-panel` with the admin profile before final format/check, then records the formatted files. `ui add @dinvolt/admin-panel` uses the same lock, profile selection and CSS merge as official components. Reinstalling unchanged files is a no-op. Existing customized or incomplete blocks, route conflicts and symlinked destinations stop installation; `--overwrite` does not override those checks. A failed upstream install restores `components.json` and does not mark an incomplete block installed; dependencies/primitives already added by upstream may remain in an existing application. Local generation staging is removed on a generation failure before any remote initialization; the finalized project is preserved after remote initialization begins. No automatic upgrades or project migrations are provided. `@dinvolt/admin-login` remains a compatibility alias for `@dinvolt/admin-panel`. Both resolve to one payload; new installations record `admin-panel`, and unchanged legacy `admin-login` receipts are recognized without rewriting application files or their receipts. Source paths changed, while installed destinations and versions remain the same.

`@dinvolt/admin-spinner` installs Dinvolt's custom SVG Spinner into `src/components/admin/ui/spinner.tsx`, with its shadcn license. It is an independent admin-only registry item and does not require authentication. It keeps the shadcn/ui Spinner API, using a filled SVG arc with a 500 ms rotation and disabling animation for reduced motion. Its editable source is `catalog/registry/shared/spinner/spinner.tsx`; the internal playground imports the installed component for default, sizes and button examples. New projects use the shared `defaultAdminBlocks` list, also used by playground bootstrapping. Existing projects can install it with `dinvolt ui add @dinvolt/admin-spinner`. Its receipt protects local customization just like other Dinvolt blocks.

The generated public/login/admin groups keep a single `/admin` page. Login and logout await `resetQueryCache` before full navigation, clearing previous identity data. The layout improves navigation while each sensitive page/data/action boundary validates its own server-side session and role. The login prerenders its complete form without authentication skeletons. Its client session check runs after hydration, preserves the form while pending or on lookup failure, replaces the route for administrators and shows access denied for ordinary accounts. Anonymous session lookups skip auth/database initialization; cookies always require Better Auth validation. Protected server authorization remains independent of this presentation check. Installing the UI block does not access the database. The optional database initialization runs the known initial migration only after the generated project is finalized.

The admin block also includes an `error.tsx` recovery screen using Next.js 16.4's `retry` callback. Its server session helper awaits `connection()` before the auth read and converts provider failures into a safe application error. Auth setup supplies `auth-logger.ts`, which keeps warning/error severity while omitting raw provider messages and parameters. Session-redirecting pages and the protected layout opt out only of instant-navigation validation feedback; Cache Components, streaming and partial prefetching remain enabled.

The protected `/admin/home` page uses a shared inset sidebar adapted from [shadcn sidebar-08](https://ui.shadcn.com/blocks/sidebar#sidebar-08). It includes Home navigation, a link to the public website, a responsive mobile drawer and a user menu with the authenticated administrator’s name, email and sign-out action. The protected layout prerenders the shell and streams only the verified `{ id, name, email }` identity through a TanStack hydration boundary. `useAdminUser` reads that identity without another browser session request; it controls presentation and query scoping, while every protected API/data/action boundary still authorizes on the server. Home renders its heading and welcome text immediately, with a placeholder only for the account name. The internal playground includes Home previews for the default, pending, error and skeleton states. Existing installed blocks remain application-owned and require manual migration.

`/admin/users` lists Better Auth users through the protected `admin.users` tRPC query. Name, email and ID share one literal substring search (450 ms debounce, Enter to apply immediately, clear to reset), combined with an All roles/Admin/User dropdown. Search, role, sort and pagination live in the URL; filters reset the page, browser Back/Forward restores them, and unrelated parameters survive. Native history updates avoid an additional Server Component request. Sorting and pagination run in the database, with bounded page sizes (10/20/50/100), whitelisted sort fields and ID as a stable tie-breaker. Only the displayed columns leave the server; each request revalidates the Better Auth session and exact admin role.

Admin Home and Users share `PageHeader` from `@/components/admin/page-header`: pass `title`, optional `titleId`, `description` (React content) and `actions` (any React content). Actions align right on desktop and wrap below the heading on mobile; omit them on pages without actions. The header stays mounted while session/data fragments resolve.

Users adds a default **Create user** button through `CreateUserSheet`. The right-side sheet uses React Hook Form, Zod and Field for name, email, password (8–128 characters) and role (User by default, or Admin). It calls the existing Better Auth Admin endpoint, which checks current server permissions; it does not change the acting administrator’s session. A successful creation closes and resets the form, announces success and invalidates all users-list variants while preserving filters, URL state and visible rows. Duplicate emails get a field error; failed requests retain values, and expired/revoked access clears private queries before returning to login. No schema migration is needed.

The reusable `DataTable`, `DataTableSearch`, `DataTablePagination` and `useDataTableState` live in the admin component/hook directories. Shared Zod schemas and URL codecs are in `src/lib/table-query.ts`; extend the base schema for another entity, whitelist that entity’s sort/filter values on the server and reuse the same controls. Queries use tRPC keys scoped to the current administrator, a 60-second stale time, five-minute garbage collection and automatic stale revalidation on mount, window refocus and reconnect. Fresh results are reused when returning to a list; stale results refresh in the background. The heading, description, search, role filter, table headers, page-size selector and pagination buttons prerender immediately. Initial skeletons replace only table cells and unknown counts; query execution waits for both the verified identity and the browser URL so a deep link never fetches the default filter first. `DataTableStateSync` is a browser-only observer and keeps the URL store aligned with Next navigation without suspending the static interface; native history updates and Back/Forward remain local. Existing rows, counts and sorting indicators stay visible during updates; only unresolved dynamic values use initial skeletons. There is no manual refresh control. Background updates show no visible loading state and keep valid pagination controls available. A contextual retry appears only after an error. Invalidate `trpc.admin.users.pathKey()` after user mutations; identity changes cancel and clear all queries. Unauthorized/forbidden responses clear the cache and return to login.

The internal playground uses synthetic tRPC responses isolated from the real endpoint. No schema migration is needed. Existing installed blocks remain application-owned and require manual migration; installation requires the matching tRPC starter files. Substring search uses escaped bound SQL parameters in both supported database dialects. It does not provide full-text indexes or a production performance benchmark.

The Users toolbar includes **Export CSV**, using Dinvolt's FileDownload icon. The authenticated `/api/admin/users/export` download shares the list's search/role predicates and deterministic sort, ignores `page`/`perPage`, and exports every matching user. The server reads sequential batches of 500 using a sort cursor instead of loading all users or issuing one request per visible page. CSV uses `;`, quoted/escaped cells, CRLF and a UTF-8 BOM for spreadsheet compatibility; potentially executable spreadsheet formulas are emitted as text. Columns are ID, name, email, role, email verification, status and created date (ISO UTC). An empty result exports only the header. The route revalidates the current admin session and returns private `no-store` responses; anonymous, ordinary and revoked admins cannot export. Downloads run only on an explicit click, prevent duplicate in-flight requests, keep the table visible and show a safe error on failure. `DataTableExport` and `src/lib/csv.ts` can be reused for other admin entities.

The create wizard optionally creates the first administrator after tables are ready. Choose ready environments and enter one name/email; each receives a different random 12-character password. An environment with an existing administrator is skipped. Existing users are never promoted, overwritten or reset; duplicate emails and partial failures preserve the project and prepared tables. Use `auth:create-admin`, `auth:create-admin:staging` or `auth:create-admin:production` to continue manually.

Only a successfully created development administrator is saved as `DEV_ADMIN_USER` and `DEV_ADMIN_PASSWORD` in the ignored, private `.env.local`. In the interactive wizard, staging/production passwords are displayed on success and are not saved locally. Non-interactive administrator creation writes generated passwords to the explicitly selected private `--admin-output` file. `/admin` uses these editable initial values only in local `next dev` with the development database. Production builds/servers and Vercel deployments never prefill, even with these variables set. Missing values stay empty; sign in still requires clicking the button and authenticating.

## Complete an existing project

`dinvolt setup [--cwd <directory>]` finds the generated project root from a child directory and validates `.dinvolt/config.json`. The primary flow is `dinvolt create` without credentials, explore with the selected manager's dev script, create your external database, then run `dinvolt setup`. Provisioning Turso/PlanetScale services is outside the CLI.

The interactive command reports connection state without values, lets you select environments to complete or add another environment, and verifies effective Next.js dotenv precedence before initialization. Development uses unsuffixed credential keys; staging/production use `_STAGING`/`_PRODUCTION`. Complete credentials are tested before asking for replacements. Failed verification supports correction, retry or omission. Unknown schemas, modified initial migrations and later migrations require manual review; setup never adopts history or regenerates the initial migration.

It preserves comments, unrelated keys, existing auth secrets, custom scripts and code, lockfiles and one shared migration directory. Private writes are atomic, owner-only and Git-ignored. A tracked dotenv file is preserved and an untracked private destination is offered. Cancellation retains completed local and remote work; rerun setup to inspect and complete pending items. Restart dev after env changes.

Only projects with administration offer the first administrator, after real schema readiness and an existing-admin check. One identity is used for selected ready environments, each with its own random 12-character password. Only successful development creation persists `DEV_ADMIN_USER`/`DEV_ADMIN_PASSWORD` in the selected private file. Passwords for staging/production are shown only in an interactive terminal. Existing users, passwords and roles are preserved. Public-only projects skip database/admin questions and install no new capabilities.

Old metadata with explicit database and Better Auth Admin capabilities remains supported. Missing/invalid metadata or missing original helpers produce a repair diagnostic; setup does not guess a provider or install missing capabilities. Existing manual `db:init`, `db:migrate` and `auth:create-admin` scripts remain available.

## `dinvolt vercel setup`

Run interactively inside a generated project, or pass `--cwd <directory>`. After you publish its repository and `main`, select the Vercel team/project, review variables and connect the Git integration. It preserves the project type and local dotenv files. Only your subsequent Git pushes/merges publish application changes; Dinvolt does not upload local code or invoke a deployment. Connecting the integration can trigger a provider-side initial Git build. See [Vercel setup](vercel.md) for environment isolation, domains, retries and supported providers.

## Agent execution for existing projects

All four commands (`create`, `setup`, `vercel setup`, `ui add`) support `--no-input` and `--json`. JSON implies no input, with one result on stdout and progress on stderr. Missing TTY or `CI=true` / `CI=1` also selects non-interactive execution. Without these conditions, setup commands retain their existing wizards; include `--no-input` or `--json` when passing setup choices in a terminal. `ui add` retains its existing interactive progress presentation.

The common result uses `schemaVersion: 1`, the full `command` name, `status`, `project`, `completedSteps`, `database`, `administrators`, `nextSteps`, optional `details` and optional `error`. Configuration secrets and passwords are omitted. Parser/input errors use `INVALID_OPTIONS`; execution errors use `SETUP_FAILED`, `VERCEL_SETUP_FAILED` or `UI_ADD_FAILED`. Missing required values cannot consume another recognized flag such as `--json`; use `--option=<value>` for a literal value matching a flag. Help stays plain text.

Exit `0` indicates success or an intentionally read-only status result; `1` indicates invalid input, failed execution or incomplete requested setup; observed interruption uses `130`. Read `completedSteps` and `project.path` after failures: earlier operations can have succeeded and are not rolled back. Do not treat a nonzero exit as proof that nothing changed.

### Setup without a wizard

```sh
# Default agent action: inspect credentials/connections without changing anything.
dinvolt setup --json
# Equivalent explicit form.
dinvolt setup --status --json

# Enable staging locally, leaving its credentials pending.
dinvolt setup --add-environments staging --json

# Verify/save supplied credentials and inspect/initialize development.
dinvolt setup --complete development --credentials-file /private/db.json --json

# Add and complete an environment in the same invocation.
dinvolt setup --add-environments staging --complete staging \
  --credentials-file /private/staging.json --json
```

`--status` is read-only and cannot be combined with changes. `details.connections` reports `connected`, `credentials-pending` or `connection-failed`; connection success does not establish schema or administrator readiness. Public-only setup is a successful no-op and rejects database/admin changes.

`--complete` takes a comma-separated subset of configured environments, including ones explicitly added in the same invocation. Without a credentials file, it uses each environment's effective project/inherited values. With `--credentials-file`, provide every credential key for all selected environments using the same private JSON format and suffixes as `create`. There is no fallback from one database environment to another. All selected inputs are validated before adding environments; effective dotenv precedence is rechecked before database initialization. A conflict skips initialization and reports attention required.

If an existing dotenv file is tracked, `--use-private-env` explicitly selects the ignored alternative offered by the wizard; otherwise setup stops and explains the choice. Existing auth secrets and other environment variables are preserved. Initial database preparation remains sequential and guarded by the genuine migration/schema history; no later migrations are applied.

First-administrator creation is opt-in and uses the same private output contract as `create`:

```sh
dinvolt setup --complete development \
  --admin-environments development --admin-name "Project Admin" \
  --admin-email admin@example.com --admin-output /private/new-admin.jsonl --json
```

Administrator environments must be included in `--complete`. Each must reach schema readiness first. Existing users are preserved. Development login defaults are saved in the same ignored dotenv file selected during connection setup. Restart dev after environment changes. Partial failures retain completed operations and report pending work.

### UI installation without a wizard

```sh
dinvolt ui add dialog textarea --target public --json
dinvolt ui add @dinvolt/public-actions --target public --json
dinvolt ui add input --target admin --overwrite --no-input
```

The default target, name validation, component profiles, locks, registry conflict handling and root profile restoration are shared with the existing installer. `details` contains requested `components`, resolved `target`, component `path` and the requested `overwrite` setting. Official component replacement still requires `--overwrite`; Dinvolt blocks retain their own change-preservation checks. No-input mode does not grant overwrite permission. Installer stdin stays closed and output is captured.

### Vercel setup without a wizard

```sh
dinvolt vercel setup --team my-team --project my-project \
  --origin https://my-project.vercel.app --apply --json
```

Supply `--team <id-or-slug>`, exactly one of `--project <id-or-name>` or `--new-project <name>`, a public HTTPS `--origin`, and `--apply`. `--apply` explicitly requests hosting/environment changes and Git connection, which can trigger a provider-side initial build. This is not a dry-run mode. The command does not upload source, commit, push or invoke deploy.

- `--git-remote <name>` selects an existing remote; required if multiple exist.
- `--preview` configures Preview with staging. The non-interactive default (`--no-preview`) configures Production only. Existing Preview deployment settings are preserved for already-linked projects.
- `--add-domain` permits associating the supplied origin when absent. Ownership/DNS must already be ready; no domain purchase or DNS changes occur.
- `--replace production:KEY,preview:KEY` permits replacing only those planned base variables. Other existing values and branch overrides are retained; shared-target entries still require manual separation. Authentication secrets are preserved by the existing secret-generation rules.
- `--email-file <path>` supplies remote password-recovery settings separately from local credentials. Its JSON maps configured targets to `RESEND_API_KEY` and `EMAIL_FROM`, for example `{ "production": { "RESEND_API_KEY": "<remote-key>", "EMAIL_FROM": "App <mail@example.com>" } }`. Keep it private and outside Git. It applies only to projects with administration.

An existing local team/project link must match the explicit destination. Authentication is never started automatically: authenticate separately using the official Vercel CLI or provide `VERCEL_TOKEN` through the process environment. Missing database preparation is reported with instructions to run `dinvolt setup`; no nested setup wizard or migration is invoked.

`details.plan` exposes the resolved destination, origin, targets, repository and variable names/types/actions without values. `details.hosting` reports the verified final configuration and pending recovery email. `completedSteps` records local linking, project/domain creation when requested, settings, individual variable writes, Git connection and branch confirmation. Some of these operations precede the final plan application; after failure, reuse the existing project with `--project` and inspect the recorded progress instead of blindly creating another project.
