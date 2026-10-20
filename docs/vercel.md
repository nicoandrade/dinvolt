# Deploy with Vercel

Connect your generated app to Vercel. Your Git repository supplies the code, and pushes to `main` deploy to Production.

## Before you begin

Prepare these first:

- **Node.js 24+, npm and Git** on your computer.
- A Git repository with your app published on **`main`**.
- A Vercel account with access to the repository. Authorize Vercel's Git provider app for your team.
- For admin projects, a configured **production database**. Prepare staging too if you want Preview deployments.

If database setup is pending, run this inside your project:

```sh
npx dinvolt setup
```

Review and apply migrations before hosting setup. Connecting Git can start a build of your published code.

Automatic Git connection supports GitHub.com, GitLab.com (including groups) and Bitbucket.org. Other providers and self-hosted servers need their official Vercel integration.

## Connect your project

### 1. Run the wizard

From your generated app:

```sh
npx dinvolt vercel setup
```

Or point to it from another directory:

```sh
npx dinvolt vercel setup --cwd ./my-app
```

### 2. Choose the destination

Select your Git remote, Vercel team and an existing or new project. Sign in to Vercel if prompted.

Dinvolt verifies the published `main` branch and checks that any existing project link matches.

### 3. Review the configuration

Choose your Production domain and whether to enable staging-backed Preview deployments. Admin projects can also configure password-recovery email.

Review the destination and environment-variable plan, then confirm. Existing variables are preserved unless you choose to replace them.

### 4. Deploy through Git

Connecting Git may trigger Vercel's initial build. After setup, future pushes or merges to `main` trigger Production deployments.

Check the deployment in Vercel. Saving environment variables does not update a deployment already running.

## Environments and origins

| Vercel target | Database source | App origin |
| --- | --- | --- |
| Production | Selected provider's `_PRODUCTION` keys | Verified domain assigned to the project. |
| Preview (opt in) | Selected provider's `_STAGING` keys | Unique deployment hostname supplied by Vercel. |

Public-only projects need a site origin. Admin projects also need database, authentication and optional recovery-email settings.

Hosting setup reads the relevant database values using Next.js dotenv precedence, including inherited values. It does not query the database or run migrations.

If credentials or an environment are missing, the interactive wizard offers the separate database setup flow. Complete it before continuing.

## Production domains

Choose a domain already assigned to the selected project, or associate a domain you own. For example:

```text
https://my-app.vercel.app
https://app.example.com
```

The wizard verifies domain ownership and DNS configuration. It does not purchase domains or edit DNS.

If a custom domain is pending, follow the instructions in **Vercel → Domains**, then rerun setup. Existing assignments are never taken over.

Production uses the verified origin for `NEXT_PUBLIC_SITE_URL` and, in admin projects, `BETTER_AUTH_URL`.

## Preview deployments

Enable Preview in the wizard to use your staging database for Git previews.

For authenticated previews, open the **unique deployment URL** from Vercel. For example:

```text
https://my-app-unique-deployment.vercel.app
```

Authentication derives its origin from `VERCEL_URL`. Site metadata uses `NEXT_PUBLIC_VERCEL_URL` when the deployment environment is `preview`.

Branch aliases and custom Preview domains are not automatically trusted authentication origins. To add a stable Preview domain, review both authentication origins and public metadata.

The generated resolver ignores production/local origins in Preview. It does not trust forwarded headers or every `*.vercel.app` hostname.

Preview is off by default for a new non-interactive connection. Omitting Preview on an existing integration preserves its current settings.

### Social images

Next.js 16.4 file-based social images can use the branch alias even when page metadata uses the unique deployment URL. This does not make the alias a trusted authentication origin.

If social images must use immutable deployment URLs, review explicit social-image metadata separately.

## Password recovery

For admin projects, configure these values separately for Production and Preview:

```dotenv
RESEND_API_KEY=<resend-api-key>
EMAIL_FROM=My App <noreply@example.com>
```

Enter them when the wizard asks. Local development email values are not copied to Vercel.

Email is optional. Without these settings, password recovery remains unavailable.

For scripts, use a private JSON file as shown in [Agents and scripts](#agents-and-scripts).

## Agents and scripts

Authenticate with the Vercel CLI or provide `VERCEL_TOKEN` before running without prompts. Complete database setup separately; this mode does not open other wizards.

### Configure an existing project

Replace the sample team, project and origin with your values:

```sh
npx dinvolt vercel setup --team my-team --project my-project \
  --origin https://my-project.vercel.app --apply --json
```

`--apply` is required. The origin must be verified and assigned to that project. Existing local links must match your choices.

### Create a new project

Use `--new-project` instead of `--project`:

```sh
npx dinvolt vercel setup --team my-team --new-project my-project \
  --origin https://my-project.vercel.app --apply --json
```

Use `--preview` for staging-backed previews. If several Git remotes exist, select one with `--git-remote`.

Use `--add-domain` to associate a domain you already own. Its ownership and DNS must be ready.

### Replace an existing variable

List only the variables you intend to replace using `target:KEY`:

```sh
npx dinvolt vercel setup --team my-team --project my-project \
  --origin https://app.example.com --add-domain \
  --replace production:NEXT_PUBLIC_SITE_URL,production:BETTER_AUTH_URL \
  --apply --json
```

The authentication variable in this example applies to admin projects. Other variables and branch overrides are preserved.

### Supply recovery-email settings

Save a private file outside Git, such as `../hosting-email.json`:

```json
{
  "production": {
    "RESEND_API_KEY": "<production-api-key>",
    "EMAIL_FROM": "My App <noreply@example.com>"
  },
  "preview": {
    "RESEND_API_KEY": "<preview-api-key>",
    "EMAIL_FROM": "My App Preview <preview@example.com>"
  }
}
```

Then select both targets:

```sh
npx dinvolt vercel setup --team my-team --project my-project \
  --origin https://my-project.vercel.app --preview \
  --email-file ../hosting-email.json --apply --json
```

For Production only, omit `--preview` and remove the `preview` entry from the file.

JSON output contains the plan, verified result and completed steps without variable values. See [CLI options](cli.md#dinvolt-vercel-setup) and [JSON results](cli.md#automation-and-json) for the full reference.

## What the command changes

Dinvolt configures these Vercel settings:

| Setting                   | Value                                         |
| ------------------------- | --------------------------------------------- |
| Framework                 | Next.js                                       |
| Node.js                   | 24.x                                          |
| Root Directory            | App directory relative to the Git repository. |
| Build, install and output | Framework and lockfile defaults.              |
| Production Branch         | `main`                                        |

Locally, it saves `.vercel/project.json` and its Git ignore rule. It uses the pinned official Vercel CLI **64.5.0** through npm.

The command does not upload local source, commit or push changes. You manage the repository and migrations through your own workflow.

### Existing links and custom builds

Review custom build lifecycles, install hooks, `vercel-build` scripts and `vercel.json` overrides before setup.

These configurations need manual setup:

- `vercel.ts`, `vercel.toml` and legacy `now.json`.
- Repository mappings in `.vercel/repo.json`, managed with the official Vercel CLI.

Dinvolt preserves existing repository mappings. A local link to another team or repository stops setup.

### Older or customized starters

Before enabling Preview, adopt the deployment origin resolver in your app:

1. Add `getAuthOrigin` from `catalog/auth/auth-origin.ts`.
2. Use it for `baseURL` and `trustedOrigins` in `src/lib/auth-config.ts`.
3. Apply the Preview URL logic from `catalog/ui/site.ts` to `src/config/site.ts`.
4. Review and publish your changes.

Preserve your customizations. Hosting setup does not replace application source.

## When a deployment happens

Dinvolt saves and verifies the approved configuration before connecting a new Git integration. Project creation itself receives no Git repository or source files.

**Connecting Git can trigger an initial build of the published repository.** Have the database and that commit's code ready before confirming setup.

An existing Git integration remains active throughout setup. Coordinate pushes and other configuration changes until setup finishes.

The command does not invoke a deploy, redeploy or deploy hook. After setup, pushes or merges to `main` produce Git deployments.

## Secrets and variable handling

Database, authentication and email credentials are sent as Secret values through stdin. Public origins and the email sender use Config values.

For each remote target, Dinvolt creates a new `BETTER_AUTH_SECRET` only when the key is absent. Reruns preserve existing remote secrets; local auth secrets are never copied.

| Situation | Behavior |
| --- | --- |
| An existing variable needs a change | Ask for replacement, or require `--replace` in scripts. |
| A remote secret already exists | Preserve it without requesting its value. |
| Auth secrets are shared across targets | Stop for explicit remediation in Vercel. |
| Database keys conflict with the target | Stop for explicit review. |
| A target defines local/admin/provider system keys | Stop for explicit review. |

Conflicting keys include `DINVOLT_DATABASE_ENV`, `DEV_ADMIN_*`, `VERCEL_TOKEN` and manually defined Vercel environment/URL variables.

### Advanced implementation details

Dinvolt writes the non-secret project link directly. It does not run `vercel link` or `env pull`, refresh OIDC in `.env.local`, or copy dotenv files into metadata.

Variable replacement uses the inspected ID through the official CLI's v10 API. This selects the base target variable without changing branch overrides. Encrypted Config entries may be read individually for comparison; retained database, auth and email secrets are never requested.

The production branch uses the scoped project-branch endpoint from Vercel's official Terraform provider. Dinvolt verifies the resulting settings before completing setup.

## Troubleshooting

Setup preserves completed operations if it fails or is cancelled. Check the current state, then rerun.

| Problem | Next step |
| --- | --- |
| Authentication or provider access fails | Check Vercel login, team permissions and the Git provider app's repository access. |
| Custom domain is pending | Complete the requested DNS/ownership steps in Vercel Domains, then rerun. |
| Database credentials are missing | Complete the required environment with `setup`. |
| Project creation result is unclear | Select the existing project on retry; in scripts, use `--project`. |
| Hosting variables conflict | Review the named keys in Vercel, resolve the conflict and rerun. |

Provider errors are summarized to avoid exposing submitted values. A failed command may still have completed a remote change.

## Official contracts

For the underlying Vercel behavior, see:

- [Git integration and production branches](https://vercel.com/docs/git)
- [Git CLI](https://vercel.com/docs/cli/git) and [connection implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/git/connect-git-provider.ts)
- [CLI API authentication and stdin](https://vercel.com/docs/cli/api)
- [Environment variables](https://vercel.com/docs/cli/env) and [CLI variable updates](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/env/update-env-record.ts)
- [Framework-prefixed system variables](https://vercel.com/docs/environment-variables/framework-environment-variables)
- [Production branch endpoint](https://github.com/vercel/terraform-provider-vercel/blob/main/client/project.go)
