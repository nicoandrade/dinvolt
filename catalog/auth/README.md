# Authentication

Better Auth uses email/password sign-in, `better-auth/minimal`, the selected database's Drizzle adapter (`sqlite` for Turso Database, `pg` for PlanetScale Postgres), and the Admin plugin. The server API is available through `getAuth()` from `@/lib/auth`; the React client is `authClient` from `@/lib/auth-client` and includes `adminClient()`.

These quickstart commands target development. For a project without development, use the selected `:staging` or `:production` variants described below.

1. Complete database credentials in the `.env.local` created by Dinvolt. It already contains a unique `BETTER_AUTH_SECRET`, generated locally with Node.js cryptographic randomness. Keep this value when editing the file; copying `.env.example` over it would erase the secret.
2. `BETTER_AUTH_URL` already matches your project's Portless origin (`https://<project-name>.localhost`) in `.env.local` and `.env.example`. Run your package manager's `dev` script to use that origin; see `docs/development.md`. Set the URL to the assigned public origin in Vercel Production. Preview uses its exact `VERCEL_URL` through `getAuthOrigin`; enable Vercel system variables and open the unique deployment URL. `.env.local` is ignored by Git and created with owner-only read/write permissions; the secret is never printed by Dinvolt or stored in `.env.example`.
3. If the wizard reported auth tables ready, initialization is complete. Otherwise review the already generated initial SQL in `drizzle/` and run `db:init` against an empty database. Later schema changes use `db:generate`, SQL review and `db:migrate`. Use the package manager selected for your project. Auth tables and Admin fields are already included in `src/db/auth-schema.ts` and exported through `src/db/schema.ts`.
4. If you deferred administrator creation in the wizard, create the first administrator with the command below. The command checks the authentication tables and columns, asks for any missing name/email, and creates a cryptographically random 12-character initial password. It displays that password once in the interactive terminal after creation; save it before closing the terminal. It never writes the password to files or passes it as a process argument. Run this only from a trusted terminal against the intended database; new sign-ups receive the ordinary `user` role.

After reviewing the initial SQL, initialize an empty development database if needed:

```sh
bun run db:init
```

Create the first development administrator when it is still pending:

```sh
bun run auth:create-admin --email admin@example.com --name Admin
```

`dinvolt setup` completes the database and authentication steps after you explore the site and create the external database; connection during creation remains optional. It can add another database environment without adding capabilities. It checks existing administrator state before offering creation. The create wizard optionally creates the first administrator after tables are ready. Choose ready environments and enter one name/email; each receives a different random 12-character password. An environment with an existing administrator is skipped. Existing users are never promoted, overwritten or reset; duplicate emails and partial failures preserve the project and prepared tables. Use `auth:create-admin`, `auth:create-admin:staging` or `auth:create-admin:production` to continue manually.

When using the create/setup wizard, only a successfully created development administrator is saved as `DEV_ADMIN_USER` and `DEV_ADMIN_PASSWORD` in the selected ignored private dotenv file (`.env.local` by default, or `.env` when that is the existing destination). The interactive wizard displays staging/production passwords on success without saving them locally. Non-interactive `create` and `setup` require a private `--admin-output` file for generated passwords; see the Dinvolt CLI reference. `/admin` uses these editable initial values only in local `next dev` with the development database. Production builds/servers and Vercel deployments never prefill, even with these variables set. Missing values stay empty; sign in still requires clicking the button and authenticating.

If authentication tables or columns are missing, the command stops before creating an account and shows the matching `db:migrate` command (including `:staging` or `:production`). Connection and permission errors are reported separately. It never applies migrations automatically. An existing email is rejected without changing its password or role. A failed write can be partial; inspect the account before retrying. The initial password works immediately and does not expire automatically. Password recovery requires the email configuration described below.

For staging/production, first confirm the wizard reported auth tables ready, or initialize with `db:init:staging` / `db:init:production` (use the matching `db:migrate` command for later reviewed changes), then use the matching `auth:create-admin:staging` or `auth:create-admin:production` command. `auth:generate:staging` and `auth:generate:production` are available if you need to regenerate the shared auth schema from a project without development. These scripts exist only for the selected environments. Their explicit target overrides inherited Vercel and database selectors; no credentials from another environment are used as a fallback. The unsuffixed auth commands always target development. See `docs/database.md` for the variable names, environment-file precedence and Vercel mapping.

Use `npx dinvolt vercel setup` after publishing your Git repository/main to prepare hosting variables and Git integration. It generates separate remote secrets and preserves existing ones. Database suffixes do not apply to `BETTER_AUTH_URL` or `BETTER_AUTH_SECRET`: set these per hosting environment (Preview derives its origin from Vercel) and provide the matching values to trusted local admin commands. Do not reuse the local auth secret in production or assume the database script switches auth/email configuration automatically.

The catch-all Next.js route is `src/app/api/auth/[...all]/route.ts` and exports GET/POST through `toNextJsHandler`. `nextCookies()` is the final server plugin so authentication in Server Actions can set cookies. Initialization is lazy: the welcome pages and build work before credentials are configured. An anonymous `GET /api/auth/get-session` returns `null` with `private, no-store` before initializing auth or the database. A cookie’s presence always delegates to Better Auth for validation; keep the cookie helper aligned if cookie names/prefixes change.

Use `authClient.signUp.email({ email, password, name })`, `authClient.signIn.email({ email, password })`, `authClient.useSession()` and `authClient.signOut()` from client components. On the server:

```ts
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

const session = await getAuth().api.getSession({ headers: await headers() });
```

Validate that session on the server before protected operations. Admin pages and custom admin APIs must also check `session.user.role?.split(",").includes("admin")`; a client check or session cookie alone is insufficient. The Admin plugin protects its own management endpoints. Keep session checks request-scoped, outside shared Next.js caches. Cookie caching is left disabled so role changes and bans are checked against the database.

The schema includes `user`, `session`, `account`, and `verification`, plus Admin's role, ban and impersonation fields. Do not rename or remove these exports. Keep application tables in `src/db/schema.ts` and preserve its auth exports. After changing auth plugins/options, run the `auth:generate` script, review `src/db/auth-schema.ts`, then generate/review/apply Drizzle migrations. The wrapper runs the official CLI and adapts generated legacy relation imports for Drizzle v1 on Turso. All schema creation and changes use Drizzle migrations; do not use Better Auth's built-in database migrator with this adapter.

Regenerate the shared authentication schema after changing plugins or options:

```sh
bun run auth:generate
```

Change shared authentication options in `src/lib/auth-config.ts`. `src/lib/auth.ts` and `src/db/index.ts` are the application's `server-only` entry points. Their internal factories are shared with the trusted root `auth.config.ts` so the CLI can load the same configuration without removing those guards. Application code should always import `getAuth` from `@/lib/auth` and `getDb` from `@/db`.

The Postgres adapter enables transactions. Turso keeps Better Auth's default nontransactional adapter mode: the pinned Drizzle driver's transaction API shares one HTTP stream and cannot safely overlap authentication transactions. Do not enable that option until the driver supports isolated concurrent transactions. Ordinary Turso queries are serialized by the SDK connection.

## Password recovery and email

Resend is the default email provider. Set `RESEND_API_KEY` and `EMAIL_FROM` in `.env.local` and each deployment environment. Use a sender on a domain verified in Resend, for example `My App <accounts@example.com>`. The starter leaves both values blank; sign-in and builds still work without email configuration, but recovery emails cannot be delivered until it is configured. Never expose the API key through `NEXT_PUBLIC_*` variables.

`src/lib/email.ts` renders `src/emails/reset-password-email.tsx` with React Email and sends HTML plus plain text through the Resend HTTP API. The transport avoids SDK development logging of provider responses and bounds each request to ten seconds. The template uses a Matte-inspired layout and a neutral HEX palette grouped in its `colors` object. It does not inherit the public portal’s CSS variables or dark mode. Customize that palette for your application; automatic theme synchronization would need to resolve the public theme into email-safe color values. Keep delivery code on the server; its internal import from `auth-config.ts` also supports the trusted auth CLI. Provider errors are sanitized by the auth logger. Monitor server errors and Resend delivery events: a successful recovery request deliberately does not confirm delivery or account existence.

All email templates should reuse `EmailHeader` from `@/emails/components/email-header`. It uses the version from `@/lib/icons` to display `/icons/<version>-apple-light.png`, generated from the shared `src/components/logo-iso.tsx`, as an email-compatible PNG. Replace that single logo component and redeploy to update the application and email branding. Pass the application’s absolute public URL to the header; password recovery derives it from Better Auth’s supplied reset URL, without including its token in the image URL. The image route must remain public and reachable by email clients. Localhost previews work locally, but real recipients need the deployed origin.

The login links to `/admin/forgot-password`. It calls `authClient.requestPasswordReset` with `/admin/reset-password` as the callback. Better Auth generates and validates the reset token; always send its supplied URL unchanged. Tokens expire after one hour and are single-use. The reset page validates the password and confirmation, calls `authClient.resetPassword`, clears private query data, removes the token from the address bar on success and links back to sign-in. Successful resets revoke existing sessions. Keep client password limits aligned with Better Auth when customizing them.

The application wires Better Auth background tasks to Next.js `after` so email delivery does not delay the public response and stays attached to the serverless request lifecycle. The trusted CLI has no request lifecycle and awaits tasks. Keep Better Auth's origin validation and rate limits enabled; before scaling across instances, configure a shared rate-limit store or deployment-level limits appropriate to your traffic. Do not log reset URLs, tokens or email payloads, or add analytics to recovery URLs without redaction. Recovery pages use `no-referrer` and disable indexing.

Forms and headings prerender without session or database reads. Only explicit submissions call auth endpoints. The same confirmation appears for existing and unknown emails. Email verification, invitations and public registration UI remain product-specific; this recovery flow does not enable them.

References: [Better Auth password recovery](https://better-auth.com/docs/authentication/email-password#request-password-reset), [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [React Email rendering](https://react.email/docs/utilities/render).

## Administrator login

New Dinvolt projects include `/admin` for sign-in, `/admin/home` for Home and `/admin/users` for user management. The login is based on shadcn login-05 and uses React Hook Form with Zod/Field validation, then calls `authClient.signIn.email` directly. Email and password are required. The password-reset link appears below the form. Social login and registration links are omitted until those features are configured. The login prerenders its complete form without a skeleton or a blocking server session read. After hydration, `LoginScreen` checks the session through `authClient.useSession()` while preserving the form and any typed input. Pending or failed checks keep the form usable. This client check controls presentation only; server authorization remains required. An authenticated ordinary user gets an access-denied message with logout; an admin is redirected to the protected Home page at `/admin/home` with an inset sidebar and a user menu that provides logout.

`src/lib/admin-auth.ts` exports request-scoped `getAdminSession`, exact-role `isAdmin`, and `requireAdmin`. Call `requireAdmin` wherever a server page/component reads protected data, and at sensitive data or Server Action boundaries; the protected layout alone does not authorize operations. Keep static page structure outside that wait. A page that renders only static UI and client queries still requires independently authorized endpoints for those queries. Use `adminProcedure` for admin tRPC operations. An absent session cookie can skip DB initialization, but its presence always requires real Better Auth validation. Keep that cookie helper aligned if cookie names/prefixes change. Session/role data must remain outside shared caches. Queries are cancelled and cleared with `resetQueryCache` after successful login/logout and before full navigation.

The installed block is application-owned source. Its version and file hashes are recorded in `.dinvolt/ui/config.json`; new Dinvolt releases do not update it.

The protected layout keeps its static shell outside the session boundary. It waits for request time before reading Better Auth, then streams a minimal `{ id, name, email }` identity through a request-scoped TanStack hydration boundary. `useAdminUser` has no client query function: it observes only this server-verified identity and never starts another session request. Users queries wait for that identity and the browser URL; their API still revalidates session and exact admin role. Clear all queries on identity changes as before. A temporary session-service error shows a retry screen without granting access or exposing provider details. Keep `src/lib/auth-logger.ts` wired in auth config: provider messages and attached objects can contain SQL parameters or session tokens, so the default logger retains severity with fixed messages only.

## Users list

The protected layout calls `requireAdmin` and streams the minimal verified identity; `/admin/users` prerenders its static UI and enables its query only after that identity and the browser URL are ready. Its read-only `admin.users` tRPC procedure independently validates the current Better Auth session, ban state and exact admin role on every request. It queries the existing auth schema through Drizzle, combining literal substring search over name/email/ID with exact comma-separated role membership. Only display fields are returned. Passwords, tokens, account and session fields never enter the list response. Keep Better Auth's Admin plugin for auth-management operations; custom list queries must use `adminProcedure`.

URL state, pagination and reusable components are documented in `docs/trpc.md`. The browser caches each administrator/filter combination for one minute and retains rows during silent background refreshes. Stale queries revalidate automatically on mount, window refocus and reconnect; there is no manual refresh control. Invalidate `trpc.admin.users.pathKey()` after mutations; await `resetQueryCache` on identity changes. No database migration is needed.

## Create users

The Users page shares `PageHeader` with Home. Its optional `actions` slot accepts arbitrary React content. `CreateUserSheet` supplies the default **Create user** button and a sheet with name, email, password and User/Admin role. It calls `authClient.admin.createUser`, using the existing Admin plugin’s server authorization and password hashing. The form validates input, handles duplicate emails, guards repeated submissions and resets only after success or dismissal. Successful creation invalidates `trpc.admin.users.pathKey()` while retaining current rows and filters. The acting admin’s session is preserved. Keep password validation aligned with your Better Auth configuration if you customize its defaults. No database migration or email delivery is required by this flow.

## User details

User rows link to `/admin/users/[userId]`. The detail page uses `PageHeader` for the user's name and an outline **Edit user** action, followed by a compact definition list of account fields. Static navigation, the edit trigger and field labels render immediately; only the name and field values use initial skeletons. The `admin.user` query independently requires an administrator and selects only display fields, including update and ban details. A missing user has a contextual message and a link back to the list. Private queries are scoped to both user ID and administrator identity, with no previous-user placeholder data.

The breadcrumb shows **Admin Panel → Users → user name**, with Users linking to the list. `useAdminBreadcrumb` publishes the name from the detail's existing authorized query into the surrounding shell; it never starts another API, session or database read. Registration is scoped to the current route and verified administrator identity, and cleared when the page leaves. Only the final name uses an initial skeleton; existing names remain visible during background refreshes and update after edits. Other detail pages can reuse the same hook with their own path, title and parent link.

`EditUserSheet` updates name and email through `authClient.admin.updateUser`. Better Auth authorizes the operation and validates email uniqueness. Successful edits invalidate both detail and list queries without clearing existing data, and update the account menu when editing the current administrator. Role, ban and password management remain separate from this form. No database migration is needed.

## Settings examples

`/admin/settings` and `/admin/settings/preferences` reuse the protected admin shell and show example settings forms. They validate and preview values locally without saving settings or uploading files. Add application-specific storage and independently authorized server operations when turning them into persistent features.
