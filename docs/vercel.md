# Vercel setup through Git

Run `npx dinvolt vercel setup --cwd ./my-app` in an interactive terminal after publishing your repository and its `main` branch. Dinvolt uses the pinned official Vercel CLI **64.5.0** through npm, with your normal Vercel login. Node.js/npm and Git must be available.

The workflow is **create → setup when credentials are available → publish the Git repository yourself → vercel setup → push/merge to main**. `create` requires no external account, initializes a local `main` branch when there is no Git marker, and never commits. Existing repositories/worktrees and their branches are preserved. Only you create the remote, commit and push.

## What the command changes

Choose the Git remote, Vercel team and existing/new project. Dinvolt verifies the published `main`, checks existing links, shows the destination and asks before changing its configuration. It configures Next.js, Node.js 24, the app's directory relative to the repository, framework/lockfile build defaults and `main` as the production branch. Review custom build lifecycles (including `vercel-build` and install hooks) or `vercel.json` overrides manually before using the command. Alternative `vercel.ts`, `vercel.toml` and legacy `now.json` configurations require manual setup. Database migrations must be reviewed and applied explicitly, never from a hosting build.

The supported automatic Git connections are GitHub.com, GitLab.com (including groups) and Bitbucket.org. Install/authorize Vercel's Git provider app for the repository and grant the selected team access. Self-hosted servers and other providers need their official Vercel integration; the command does not replace that with a source upload.

Only `.vercel/project.json` and its Git ignore rule are saved locally. Dinvolt writes the documented non-secret link directly because `vercel link` also refreshes OIDC in `.env.local`. It never runs `env pull`, copies dotenv files or records secrets in metadata. Existing links to other teams/repos stop the flow. Repository mappings in `.vercel/repo.json` require the official CLI; Dinvolt preserves them without creating a competing project link. Failed or cancelled runs retain completed operations; rerun to inspect and continue. If project creation has an ambiguous result, select the existing project on retry rather than creating another.

## Environments and origins

| Hosting target | Database credentials | Authentication and site origin |
| --- | --- | --- |
| Production | Only the selected provider's `_PRODUCTION` keys | Verified domain actually assigned to the selected project |
| Preview (opt in) | Only the selected provider's `_STAGING` keys | Exact deployment hostname from Vercel system variables |

Public-only projects configure the site without asking for database, auth or recovery email. Admin projects use the existing Next.js dotenv precedence (including inherited values) to read only the applicable database keys. Missing environments/credentials offer `npx dinvolt setup`; entering that separate flow explicitly authorizes its connection checks and prompts. Hosting setup itself never queries or migrates a database.

A new `BETTER_AUTH_SECRET` is generated independently for each remote target only when its remote key is absent. Repeated runs preserve unreadable remote secrets. Shared secrets across hosting targets require explicit remediation; Dinvolt never rotates them automatically or copies the local secret. Private database/auth/email credentials are sent as Secret through stdin. Replacements use the inspected variable ID and explicit Config/Secret visibility via the official CLI’s v10 API because CLI update cannot uniquely select a base Preview key when branch overrides exist. Public origins and the email sender use Config. If a Config value is encrypted in the inventory, Dinvolt reads that individual Config entry to compare it; retained database, auth and email secrets are never requested. Existing keys require a replacement decision; unrelated variables and branch overrides remain intact. Conflicting database keys, `DINVOLT_DATABASE_ENV`, `DEV_ADMIN_*` or `VERCEL_TOKEN` in managed hosting targets stop setup for explicit review.

Production uses `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL`. Choose an assigned domain or associate a domain you already own. The command verifies ownership status and DNS configuration before proceeding, never buys a domain, takes over an assignment or edits DNS. A custom domain can remain pending until you follow the instructions in Vercel Domains and rerun.

Preview enables Vercel system variables. Auth uses `https://${VERCEL_URL}`; site metadata uses `NEXT_PUBLIC_VERCEL_URL` when `NEXT_PUBLIC_VERCEL_ENV` is `preview`. Open the **unique deployment URL** for authenticated previews. Branch aliases/custom Preview domains are not additional trusted auth origins. The resolver ignores production/local URL values in Preview and never trusts forwarded headers or all `*.vercel.app` hosts. If you deliberately add stable Preview domains, review both auth origins and public metadata together. Preview is disabled for a new connection when omitted; an already-active integration's Preview settings are preserved and reported.

Next.js file-based social images (`opengraph-image.tsx`) have their own Preview fallback: Next.js 16.4 can use `VERCEL_BRANCH_URL` for the image URL even when `metadataBase` uses the unique deployment origin. This does not add that branch alias to authentication trusted origins. Review explicit social-image metadata separately if images must also use immutable deployment URLs.

Password recovery is optional. Supply `RESEND_API_KEY` and `EMAIL_FROM` separately for each hosting environment. Local development values are never copied. Without them, password recovery remains unavailable.

Older/customized starters must adopt the deployment origin resolver before enabling Preview. Preserve customizations: add the `getAuthOrigin` helper from `catalog/auth/auth-origin.ts`, call it for `baseURL` and `trustedOrigins` in `src/lib/auth-config.ts`, and apply the Preview URL logic from `catalog/ui/site.ts` to `src/config/site.ts`. Review and publish these changes yourself. No automatic source replacement occurs during hosting setup.

## When a deployment happens

Project creation receives no Git repository or source files. Dinvolt checks for environment changes after confirmation, saves the approved variable plan, then verifies required keys (including retained keys), new secret types, production origins and returned project settings before connecting Git. Setup is not a transaction: coordinate other configuration changes and pushes until it finishes. The official CLI connection calls Vercel's project-link endpoint; its server-side initial-build behavior is not guaranteed here. **Connecting can cause a Git integration build of the published repository**, so database preparation and all code needed by that commit must be ready first. An existing integration stays active throughout setup; coordinate pushes while applying settings.

No `vercel deploy`, `--prod`, redeploy, deploy hook, local source upload, commit or push is invoked. A later push/merge to `main` produces the Git deployment. Saving variables does not update deployments already running.

## Official contracts

- [Git integration and production branch defaults](https://vercel.com/docs/git)
- [Vercel Git CLI](https://vercel.com/docs/cli/git) and [connection implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/git/connect-git-provider.ts)
- [CLI API authentication and stdin](https://vercel.com/docs/cli/api)
- [Environment variable types and commands](https://vercel.com/docs/cli/env) and [official CLI variable updates](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/env/update-env-record.ts)
- [Framework-prefixed system variables](https://vercel.com/docs/environment-variables/framework-environment-variables)
- [Production branch endpoint in Vercel's official Terraform provider](https://github.com/vercel/terraform-provider-vercel/blob/main/client/project.go)

The CLI has no production-branch setter; Dinvolt uses the same scoped `PATCH /v9/projects/{id}/branch` request as Vercel's Terraform provider and verifies the resulting branch. Provider errors are deliberately summarized without echoing values. Check your account/team/provider app access in Vercel when an operation fails, then rerun.

## Agents and scripts

The same hosting workflow supports explicit non-interactive choices:

```sh
npx dinvolt vercel setup --team my-team --project my-project \
  --origin https://my-project.vercel.app --apply --json
```

`--json` disables prompts and returns the resolved plan, verified result and completed steps without variable values. Existing team/project links must match. Authentication and database setup must be completed separately; the command will not open another wizard. Use `--preview` for staging-backed previews, `--new-project` instead of `--project` for explicit creation, and `--add-domain` to associate a domain without buying it or changing DNS. `--apply` is required and Git connection may trigger the provider's initial build. No source upload, push or deploy command is run.

See [agent execution](cli.md#vercel-setup-without-a-wizard) for selective variable replacement, private remote-email inputs, output states and recovery from partial failures. Human invocations without agent options retain the interactive workflow.
