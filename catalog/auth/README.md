# Authentication

Dinvolt includes email/password sign-in, an admin panel, and password recovery with Better Auth. Use the built-in screens first, then customize the application-owned source as needed.

This guide applies to **Public website + administration** projects.

## Set up authentication

### 1. Complete the database setup

Run this from your generated project:

```sh
npx dinvolt setup
```

Setup completes the selected database environment and offers to create its first administrator. See [database setup](database.md) if the connection or tables are still pending.

### 2. Keep your local auth configuration

The generated `.env.local` already contains a random `BETTER_AUTH_SECRET` and your project's Portless origin. Preserve the secret when adding credentials.

For a project named `my-app`, the local origin is:

```dotenv
BETTER_AUTH_URL=https://my-app.localhost
```

Start the development server with your package manager:

```sh
bun run dev
```

See [local development](development.md) for Portless setup. Restart the server after editing environment variables.

### 3. Open the admin panel

Open `/admin` on the local origin and sign in with the administrator created by setup.

| Route                    | Purpose                        |
| ------------------------ | ------------------------------ |
| `/admin`                 | Sign in                        |
| `/admin/home`            | Admin home                     |
| `/admin/users`           | Search, create, and edit users |
| `/admin/forgot-password` | Request a password reset       |

The login form appears immediately and remains usable while the client checks an existing session. Administrators continue to Home; signed-in users without the admin role see an access-denied message and can sign out.

## Create the first administrator

If you skipped this step in setup, use an interactive terminal:

```sh
bun run auth:create-admin --email admin@example.com --name Admin
```

The command checks the auth tables and creates a random **12-character initial password**. Save the password when it appears: the command displays it once and does not save it to a file. It works immediately and does not expire automatically.

The command preserves existing accounts. A duplicate email is rejected without changing its role or password. Missing tables stop creation; follow the matching database migration instructions before retrying.

### Staging and production

Use the command for the intended environment:

```sh
bun run auth:create-admin:staging --email admin@example.com --name Admin
```

```sh
bun run auth:create-admin:production --email admin@example.com --name Admin
```

Only selected environments receive these scripts. Commands without a suffix always target development. Provide the target environment's database credentials **and** auth configuration; selecting a database does not switch auth secrets or origins.

### Wizard-created credentials

The create/setup wizard skips environments that already have an administrator. Each newly created administrator gets a different password; existing users are never promoted or reset.

For development, a successful wizard creation saves these private defaults in the selected ignored dotenv file:

```dotenv
DEV_ADMIN_USER=admin@example.com
DEV_ADMIN_PASSWORD=your-generated-development-password
```

They prefill the local development login form. You still click **Sign in** to authenticate. Vercel deployments and production builds/servers never prefill these values.

Staging/production passwords appear in the interactive wizard without being saved locally. Non-interactive creation/setup requires a private admin-output file; see the [CLI reference](https://docs.dinvolt.com/reference/cli).

If a write fails, inspect the account before retrying: an interrupted operation can be partial.

## Configure auth environments

Database variables use environment suffixes. Auth variables use their ordinary names in each deployment's scope:

```dotenv
BETTER_AUTH_URL=https://your-app.example.com
BETTER_AUTH_SECRET=replace-with-a-random-secret-of-at-least-32-characters
```

Use a random secret of at least 32 characters. Keep the local secret, staging secret, and production secret separate; never commit private dotenv files.

| Environment       | Auth origin                                       |
| ----------------- | ------------------------------------------------- |
| Local development | The generated Portless URL                        |
| Vercel Production | Your assigned public origin in `BETTER_AUTH_URL`  |
| Vercel Preview    | The exact deployment URL supplied by `VERCEL_URL` |

Enable Vercel system environment variables and open the unique Preview deployment URL. Preview origin validation does not trust every Vercel hostname.

After publishing your Git repository and its main branch, the Vercel helper can prepare deployment variables and Git integration:

```sh
npx dinvolt vercel setup
```

It generates separate remote secrets and preserves existing ones. See [database environments](database.md#database-environments) for credential names and target selection.

## Read and protect a session

### Use the client API

Client Components import `authClient` from `@/lib/auth-client`. For example, this helper signs in and clears data from any previous identity before navigating:

```ts
// src/lib/sign-in.ts
"use client";

import { authClient } from "@/lib/auth-client";
import { resetQueryCache } from "@/trpc/query-client";

export async function signIn(email: string, password: string) {
  const { error } = await authClient.signIn.email({ email, password });

  if (error) {
    return { error: "Unable to sign in. Check your email and password." };
  }

  await resetQueryCache();
  window.location.assign("/admin/home");
}
```

The built-in forms already handle this flow. Other client APIs include session observation, sign-out, and email/password sign-up. Sign-up creates an ordinary `user`; a public registration screen is application-specific.

### Validate on the server

Client session checks control presentation. Validate a session again wherever server code reads private data or performs a protected operation:

```ts
// src/lib/current-user.ts
import "server-only";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export async function getCurrentUser() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.banned) {
    return null;
  }

  return { id: session.user.id, name: session.user.name };
}
```

Keep session and role checks request-scoped, outside shared Next.js caches. Cookie caching is disabled so database role changes and bans are checked.

### Require an administrator

The generated `@/lib/admin-auth` module provides:

| Helper | Use it for |
| --- | --- |
| `getAdminSession()` | A request-scoped, validated, non-banned session |
| `isAdmin(session)` | Exact membership of the `admin` role |
| `requireAdmin()` | Admin pages/actions that redirect unauthorized visitors to `/admin` |

Call `requireAdmin()` at every protected page, data, or action boundary, even inside the protected layout. Keep static headings and controls outside that wait.

Custom admin APIs must validate both the session and admin role. tRPC endpoints can use `adminProcedure`; see the [tRPC guide](trpc.md).

A session cookie's presence never proves access. The no-cookie shortcut only avoids unnecessary auth/database initialization; keep it aligned if you customize cookie names.

## Password recovery and email

### 1. Configure Resend

Add these values to `.env.local` and each deployment environment:

```dotenv
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM="My App <accounts@example.com>"
```

Use a sender domain verified in Resend. Keep the API key server-side.

Sign-in and builds work without these values. Password recovery needs them to deliver email.

### 2. Request a reset

1. Open `/admin/forgot-password`.
2. Enter the account's email address and submit.
3. Open the emailed link and choose a new password.
4. Return to `/admin` and sign in.

The same confirmation appears for existing and unknown emails. A successful request does not confirm delivery; check server errors and Resend delivery events when troubleshooting.

Reset links are single-use and expire after **one hour**. A successful reset revokes existing sessions, clears private query data, and removes the token from the address bar.

### 3. Customize the email

| File | Purpose |
| --- | --- |
| `src/emails/reset-password-email.tsx` | Content, layout, and email-safe color palette |
| `src/emails/components/email-header.tsx` | Shared email header |
| `src/components/logo-iso.tsx` | Logo source used by the app and email PNG |
| `src/lib/email.ts` | HTML/plain-text rendering and Resend delivery |

Reuse `EmailHeader` for other templates. Its image URL needs an absolute public app origin reachable by email clients. Replace the shared logo and redeploy to update the branding.

The email palette is independent of the site's CSS variables. Customize the template's `colors` object directly.

### Recovery safeguards

- Send Better Auth's supplied reset URL unchanged. Keep tokens, URLs, and email payloads out of logs and analytics.
- Keep the generated origin validation, sanitized auth logger, and rate limits enabled.
- Keep recovery pages unindexed with `no-referrer`.
- Align client password limits with Better Auth when changing them.

Email delivery uses a ten-second request timeout and Next.js background tasks attached to the request lifecycle. Before scaling across instances, configure shared rate limits or suitable deployment limits.

References: [Better Auth recovery](https://better-auth.com/docs/authentication/email-password#request-password-reset), [Resend API](https://resend.com/docs/api-reference/emails/send-email), [React Email rendering](https://react.email/docs/utilities/render).

## Customize authentication

### Change options or plugins

Edit `src/lib/auth-config.ts`. The application uses Better Auth's Drizzle adapter and Admin plugin; `nextCookies()` remains the final server plugin so Server Actions can set cookies.

After changing options that affect the schema:

1. Regenerate the shared auth schema:

   ```sh
   bun run auth:generate
   ```

2. Review `src/db/auth-schema.ts`.
3. Generate and review the Drizzle migration:

   ```sh
   bun run db:generate
   ```

4. Apply the reviewed migration to the intended database:

   ```sh
   bun run db:migrate
   ```

Projects without development can use the selected staging/production variant of the auth-generation script. See [database migrations](database.md#change-your-schema) for other migration targets.

Preserve the `user`, `session`, `account`, and `verification` exports and the Admin role/ban/impersonation fields. All schema changes use Drizzle migrations with this adapter.

### Server and CLI entry points

Application code imports `getAuth` from `@/lib/auth` and `getDb` from `@/db`. Both entry points enforce `server-only`.

The root `auth.config.ts` shares internal configuration with those entry points for trusted CLI commands. Keep those guards in place.

Authentication initializes lazily. An anonymous session endpoint can return `null` before database access; a present cookie always goes through Better Auth validation. Responses remain private and uncached.

### Provider transactions

PlanetScale's auth adapter enables transactions. Turso keeps the default nontransactional mode because its pinned HTTP driver cannot safely overlap auth transactions on one stream. Keep that setting until the driver supports isolated concurrent transactions.

## Manage users

### Find an account

Open `/admin/users`. Search by name, email, or ID, filter by User/Admin role, and change the page size or sort order.

Filters and pagination live in the URL, so Back/Forward restores the list. Existing rows remain visible during background refreshes. Each administrator/filter combination stays fresh in the browser for one minute.

The API rechecks the session, ban state, and exact admin role on every request. It returns display fields; passwords, tokens, accounts, and sessions stay out of responses.

### Create a user

1. Click **Create user**.
2. Enter a name, email, password, and role.
3. Submit the form.

The form uses Better Auth's Admin plugin for authorization and password hashing. Duplicate emails show a validation error. Successful creation refreshes the list while preserving filters and the acting administrator's session.

This flow does not send an email. Share initial access through your application's chosen process.

### Edit an account

Open a user row, then click **Edit user** to change the name or email. The detail page includes account status and ban details when relevant.

Saving updates the detail, list, breadcrumb, and current administrator menu when applicable. Role, ban, and password management need separate controls.

These built-in user flows use the existing auth schema and need no extra migration. See [admin tables](trpc.md#reusable-admin-tables) for query state and export behavior.

## Customize the admin interface

The panel is application-owned source. Its installed version and hashes live in `.dinvolt/ui/config.json`; a new Dinvolt release does not replace your installed files.

Use `PageHeader` for page titles and its `actions` slot for buttons such as the built-in create/edit sheets.

The protected shell streams a minimal server-verified identity to `useAdminUser`. That hook observes the existing identity without another session request. The breadcrumb also reuses the detail query rather than fetching again.

Keep these reads scoped to the current administrator and route. Clear queries after identity changes, and keep private API authorization independent of the visual shell.

The `/admin/settings` and `/admin/settings/preferences` pages are examples. Their forms validate and preview locally; add authorized server storage to persist settings or uploads.
