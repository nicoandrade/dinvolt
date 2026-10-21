# CLI reference

Create a project, complete its setup, add UI components or connect Vercel.

## Installation and help

Use Dinvolt without a global installation:

```sh
npx dinvolt --help
```

Use **Node.js 24+** to create projects. Other commands support Node.js 22.18+.

To install or update a global command:

```sh
npm install --global dinvolt@latest
```

Check your version or get help for a command:

```sh
npx dinvolt --version
npx dinvolt create --help
```

## `dinvolt create`

Start the interactive wizard:

```sh
npx dinvolt create
```

1. Enter a project name and destination.
2. Choose **Public website only**, **Public website + admin panel**, or **Admin panel only**.
3. Accept the defaults or customize your tools and UI themes.
4. For projects with an admin panel, choose a database. Connect it now or later with `setup`.

The destination must be new or empty, apart from `.git` and `.DS_Store`. Dinvolt installs dependencies, checks the generated code and initializes Git when needed.

Your project is saved without a commit. Follow the final terminal instructions to start development.

## Non-interactive creation

Pass `--no-input` to skip prompts, or `--json` to also return a structured result. Both require a name and project type.

Create a public website:

```sh
npx dinvolt create --name my-site --location new \
  --project-type public --package-manager npm --json
```

Create a Turso-backed admin project and connect the database later:

```sh
npx dinvolt create --name my-app --location new \
  --project-type public-admin --package-manager npm \
  --database turso --no-input
```

### Project options

| Option | Values / default |
| --- | --- |
| `--name <name>` | Lowercase package name. Required without prompts. |
| `--location <location>` | `current` (default) or `new`. |
| `--project-type <type>` | `public`, `public-admin`, or `admin`. Required without prompts. |
| `--package-manager <manager>` | `bun`, `npm`, `pnpm`, `yarn`, `deno`, `nub`, `aube`. Detected in the destination; otherwise Bun. |
| `--linter <linter>` | `oxlint` (default), `biome`, `eslint`. |
| `--editors <editors>` | Comma-separated `universal`, `zed`, or `none`. Default: `universal`. |
| `--public-preset <code>` | Public shadcn preset. Default: `b1aIcEacC`. |
| `--admin-preset <code>` | Admin shadcn preset. Default: `bIkeymG`. |
| `--skills` / `--no-skills` | Install recommended agent skills (default), or skip them. |

### Database options

For a standalone app, use `--project-type admin`. It generates login at `/`, protected home at `/dashboard`, and one admin shadcn/ui profile in `src/components/ui`. Use `--admin-preset` to customize it; `--public-preset` is not applicable.

These options require the `public-admin` or `admin` project type. Create the database service with your provider first.

| Option | Values / default |
| --- | --- |
| `--database <provider>` | `turso` (default) or `planetscale-postgres`. |
| `--database-environments <environments>` | Comma-separated `development`, `staging`, `production`. Default: `development`. |
| `--connect <environments>` | Connect and initialize selected environments. Omit to connect later. |
| `--credentials-file <path>` | Private JSON credentials. Required with `--connect`. |

For administrator options and a complete example, see [Credentials and administrator output](#credentials-and-administrator-output).

## Credentials and administrator output

Use a private JSON file to supply database credentials to `create` or `setup`. Keep it outside Git and pass its path to the command.

Example Turso credentials file:

```json
{
  "TURSO_DATABASE_URL": "<development-url>",
  "TURSO_AUTH_TOKEN": "<development-token>"
}
```

Staging and production keys need their environment suffix:

```json
{
  "TURSO_DATABASE_URL_PRODUCTION": "<production-url>",
  "TURSO_AUTH_TOKEN_PRODUCTION": "<production-token>"
}
```

PlanetScale uses `DATABASE_URL` and `DATABASE_URL_DIRECT`, with the same suffixes. Include every required key for each environment you select.

### Create the first administrator

For example, save your development credentials as `../database-credentials.json`, then run:

```sh
npx dinvolt create --name my-app --location new \
  --project-type public-admin --package-manager npm \
  --connect development --credentials-file ../database-credentials.json \
  --admin-environments development --admin-name "Project Admin" \
  --admin-email admin@example.com --admin-output ../new-admin.jsonl --json
```

| Option | Purpose |
| --- | --- |
| `--admin-environments <environments>` | Create an administrator in selected connected environments. |
| `--admin-name <name>` | Administrator name. Required for creation. |
| `--admin-email <email>` | Administrator email. Required for creation. |
| `--admin-output <path>` | New private password file outside the project. Required for creation. |

The output file must not already exist. It contains one JSON line per environment, with `environment`, `email` and `password`; passwords stay out of terminal output.

Existing administrators are preserved. Development login defaults are also saved in the project's ignored environment file.

## `dinvolt setup`

Run inside your generated project to complete database credentials, initial tables and the first administrator:

```sh
npx dinvolt setup
```

Public-only projects have nothing to configure. For admin projects, setup preserves existing users and custom code.

### Inspect connection status

This reads connection status without changing files or databases:

```sh
npx dinvolt setup --status --json
```

A successful connection alone does not confirm that tables or an administrator are ready.

### Complete an environment without prompts

```sh
npx dinvolt setup --complete development \
  --credentials-file ../database-credentials.json --json
```

To also create the first administrator, add the [administrator options](#credentials-and-administrator-output). Its environments must also appear in `--complete`.

| Option | Purpose |
| --- | --- |
| `--status` | Inspect connections. Cannot be combined with changes. |
| `--add-environments <environments>` | Enable comma-separated `development`, `staging`, `production`. |
| `--complete <environments>` | Verify credentials and initialize/check selected databases. |
| `--credentials-file <path>` | Supply credentials. Otherwise, use effective project/inherited values. |
| `--use-private-env` | Use an ignored alternative if the existing dotenv file is tracked. Requires `--complete`. |

Without an action, non-interactive setup only inspects connections. Initialization applies a compatible initial migration; incompatible schemas and later migrations need manual review.

Restart your development server after changing environment values. See [Database](../catalog/database/README.md) and [Authentication](../catalog/auth/README.md) for application configuration.

## `dinvolt ui add`

Install official shadcn/ui components or packaged Dinvolt blocks. The selected area determines the theme and file paths.

Add public components:

```sh
npx dinvolt ui add button dialog --target public
```

Add an admin block:

```sh
npx dinvolt ui add @dinvolt/admin-panel --target admin
```

Replace an existing official component:

```sh
npx dinvolt ui add input --target admin --overwrite
```

| Option | Purpose |
| --- | --- |
| `--target <area>` | `public` or `admin`. Defaults to public in public-only projects; otherwise admin. |
| `-o, --overwrite` | Replace existing official components in the selected area. |

Provide at least one component. Public-only projects support only the public target. Admin-only projects support only the admin target, with components in `src/components/ui`. Arbitrary registry URLs and third-party namespaces are unsupported.

Customized Dinvolt blocks need manual review, including with `--overwrite`. See the [UI registry](../catalog/registry/README.md) for blocks and usage examples.

## `dinvolt vercel setup`

Connect Vercel after publishing your repository's `main` branch:

```sh
npx dinvolt vercel setup
```

The wizard selects a team and project, reviews environment variables and connects Git. **Connecting Git may trigger an initial build.** Prepare your database and published code first.

For prerequisites, environment mapping and step-by-step instructions, see [Deploy with Vercel](vercel.md).

### Run without prompts

Authenticate separately with the Vercel CLI or `VERCEL_TOKEN`, then provide a team, an existing or new project, an origin and `--apply`:

```sh
npx dinvolt vercel setup --team my-team --project my-project \
  --origin https://my-project.vercel.app --apply --json
```

| Option | Purpose |
| --- | --- |
| `--team <id-or-slug>` | Vercel team. Required without prompts. |
| `--project <id-or-name>` | Existing project. Must match any local link. |
| `--new-project <name>` | Create a project. Use instead of `--project`. |
| `--origin <url>` | Verified public HTTPS production origin. Required without prompts. |
| `--apply` | Apply changes and connect Git. Required without prompts. |
| `--git-remote <name>` | Git remote. Required when several exist. |
| `--preview` / `--no-preview` | Configure staging-backed Preview, or Production only (default without prompts). Existing Preview settings are preserved. |
| `--add-domain` | Associate the origin. Domain ownership and DNS must be ready. |
| `--replace <entries>` | Replace listed `target:KEY` variables. Preserve others. |
| `--email-file <path>` | Private password-recovery settings for admin projects. |

See [Vercel automation](vercel.md#agents-and-scripts) for variable replacement and email-file examples.

## Shared options

These options work with all four commands:

| Option | Purpose |
| --- | --- |
| `--cwd <directory>` | Starting/project directory. Default: `.`. For `ui add`, use the project root. |
| `--no-input` | Disable prompts. |
| `--json` | Return one JSON result. Implies `--no-input`. |
| `-h, --help` | Show command help. |

Use `-v` or `--version` on the root `dinvolt` command to check the installed version.

## Automation and JSON

Add `--json` to receive one result on stdout. Progress goes to stderr; secrets are omitted. Help and version remain plain text.

Save a result for a script to inspect:

```sh
npx --yes dinvolt setup --status --json > setup-result.json
```

`npx --yes` accepts npm's package-install prompt. Dinvolt also disables its own prompts when a TTY is missing or `CI` is `true` or `1`.

When supplying `create`, `setup` or Vercel choices in a terminal, include `--no-input` or `--json`.

### Result fields

Every result includes `schemaVersion: 1`, `command`, `status`, `project`, `completedSteps`, `database`, `administrators` and `nextSteps`.

Commands may add `configuration` or `details`. Failures include `error`.

For example, inspecting a public-only project returns:

```json
{
  "schemaVersion": 1,
  "command": "setup",
  "status": "completed",
  "project": { "name": "my-site", "path": "/projects/my-site" },
  "completedSteps": [],
  "database": [],
  "administrators": [],
  "details": { "projectType": "public", "connections": [] },
  "nextSteps": ["Use the project's dev script; no database setup is needed."]
}
```

| Status            | What to do                                             |
| ----------------- | ------------------------------------------------------ |
| `completed`       | Continue with the returned next steps.                 |
| `needs-attention` | Inspect pending environment results and next steps.    |
| `failed`          | Inspect the error and completed steps before retrying. |
| `cancelled`       | Inspect persisted state before retrying.               |

### Exit codes and retries

| Exit code | Meaning |
| --- | --- |
| `0` | Success, including deferred creation setup and read-only inspection. |
| `1` | Invalid input, failure or incomplete requested setup. |
| `130` | An interruption was observed. |

A failure can leave completed local or remote operations. During creation, `project` remains `null` until the project is saved.

Continue a saved project with `setup`. After partial Vercel setup, select the existing project with `--project`.
