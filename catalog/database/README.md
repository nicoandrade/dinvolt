# Database

Connect your database, make your first query, and manage schema changes with Drizzle.

This guide applies to **Public website + admin panel** and **Admin panel only** projects.

You can explore the generated site before adding credentials. Database access starts only when server code needs it.

## Connect your database

### 1. Create a database

Create a database with the provider you selected during project creation: **Turso Database** or **PlanetScale Postgres**. Dinvolt configures the connection; it does not create the external database service.

### 2. Run setup

From your generated project's directory:

```sh
npx dinvolt setup
```

Choose the environment to complete and enter its credentials. Setup checks the connection, initializes a compatible empty database, and offers to create the first administrator.

If the summary reports **auth tables ready**, you can start using the database. Restart the development server after changing environment variables.

### Manual setup

Fill in the provider's keys in the existing `.env.local`. Preserve its generated `BETTER_AUTH_SECRET`.

Turso:

```dotenv
TURSO_DATABASE_URL=turso://your-database
TURSO_AUTH_TOKEN=your-token
```

PlanetScale Postgres:

```dotenv
DATABASE_URL=postgresql://app-user:password@your-host:6432/your-database?sslmode=verify-full
DATABASE_URL_DIRECT=postgresql://migration-user:password@your-host:5432/your-database?sslmode=verify-full
```

Review the initial SQL already generated in `drizzle/`, then initialize an empty development database:

```sh
bun run db:init
```

Use your project's package manager in place of Bun. The examples on this page target **development** unless their command includes another environment.

## Query from server code

Import the lazy database client from `@/db`. It is reused across requests and development reloads.

For example, projects with authentication already have a `user` table. This server helper selects only the fields it needs:

```ts
// src/lib/find-user.ts
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { user } from "@/db/schema";

export async function findUser(id: string) {
  const [result] = await getDb()
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  return result ?? null;
}
```

Authorize the caller before returning private data from a page, action, or API. Keep database code in the **Node.js server runtime**.

For client requests, use an authorized [tRPC procedure](trpc.md). See the [authentication guide](auth.md) for session and administrator checks.

## Change your schema

Use migrations for changes after the initial database setup.

### 1. Edit the schema

Add or update application tables in `src/db/schema.ts`. Export each table and include it in the existing `schema` object.

Keep the authentication exports from `src/db/auth-schema.ts`. PlanetScale also includes its relation exports; Turso configures relational queries with `defineRelations(schema)`.

### 2. Generate SQL

```sh
bun run db:generate
```

Open the new migration in `drizzle/` and review its SQL before applying it.

### 3. Apply the migration

Development:

```sh
bun run db:migrate
```

Staging:

```sh
bun run db:migrate:staging
```

Production:

```sh
bun run db:migrate:production
```

Confirm the target database and prepare a backup/recovery procedure before production changes. Apply migrations sequentially, outside deployment builds.

Commit the schema, `drizzle/` directory, and `.dinvolt/initial-database.json` together. All environments share this migration directory; each database tracks its own applied migrations.

### Inspect the database

Open Drizzle Studio for development:

```sh
bun run db:studio
```

Check migration consistency without connecting to a database:

```sh
bun run db:check
```

Schema generation also works without a database connection. Studio and migration commands require credentials.

## Database environments

Projects configure development by default. To add staging or production, run setup and choose **Add another environment**:

```sh
npx dinvolt setup
```

Setup preserves customized code and existing migrations. Use a separate database for each environment.

### Credential names

Append the environment suffix to the **complete** variable name:

| Environment | Suffix        | Turso token example           |
| ----------- | ------------- | ----------------------------- |
| Development | None          | `TURSO_AUTH_TOKEN`            |
| Staging     | `_STAGING`    | `TURSO_AUTH_TOKEN_STAGING`    |
| Production  | `_PRODUCTION` | `TURSO_AUTH_TOKEN_PRODUCTION` |

For PlanetScale, production migrations use `DATABASE_URL_DIRECT_PRODUCTION`. There is no fallback to another environment's credentials or from the direct URL to the pooled URL.

### Choose the matching command

Commands without a suffix always target development, including when inherited environment variables select another destination.

Staging and production receive matching initialization, migration, Studio, and authentication scripts. For example, initialize an empty staging database with:

```sh
bun run db:init:staging
```

If development was not selected, its database operations fail. Static pages still work locally. Only the selected environments receive staging/production scripts.

### Runtime selection

| Where the app runs                              | Database environment |
| ----------------------------------------------- | -------------------- |
| Local development script                        | Development          |
| Vercel Preview                                  | Staging              |
| Vercel Production                               | Production           |
| Local build/start, without an explicit override | Development          |

Trusted server processes can explicitly set `DINVOLT_DATABASE_ENV`. `NODE_ENV` does not choose a database. Unknown or unconfigured environments fail on database use.

The runtime list lives in `src/db/environment.ts`; tool metadata lives in `.dinvolt/config.json`. Use setup to keep these, environment placeholders, and scripts aligned.

## Deploy on Vercel

After publishing your Git repository and its main branch, run:

```sh
npx dinvolt vercel setup
```

Configure database credentials in the matching Vercel scope:

| Vercel scope | Database variables           |
| ------------ | ---------------------------- |
| Preview      | Only `_STAGING` variables    |
| Production   | Only `_PRODUCTION` variables |

Leave `DINVOLT_DATABASE_ENV` unset for standard Preview/Production deployments. Enable Vercel's system environment variables; `VERCEL_ENV` selects the database.

All previews use staging by default. Use isolated preview databases if branches need separate data. Custom Vercel environments require an explicit staging or production mapping through `DINVOLT_DATABASE_ENV`.

Auth and email variables have **no database suffix**. Set them separately in each hosting environment:

```dotenv
BETTER_AUTH_URL=https://your-app.example.com
BETTER_AUTH_SECRET=replace-with-a-random-secret-of-at-least-32-characters
RESEND_API_KEY=your-resend-key
EMAIL_FROM="My App <accounts@example.com>"
NEXT_PUBLIC_SITE_URL=https://your-app.example.com
```

Preview derives its auth/site origin from the exact Vercel deployment URL. Local commands against staging/production also need that environment's auth configuration: changing the database target does not switch auth secrets or email settings.

Redeploy after changing Vercel variables. See the [authentication guide](auth.md) for auth origins and email setup.

## Turso Database

The generated project uses the remote HTTP driver `@tursodatabase/serverless` with `drizzle-orm/tursodatabase-serverless`. Tables use `drizzle-orm/sqlite-core`.

- Use the Turso Cloud `turso://` URL and its auth token. Embedded `file:` databases need a different driver.
- Keep the pinned Drizzle ORM and Kit versions together; this integration uses Drizzle v1.
- Reuse `getDb()`. This driver uses `fetch` and has no Postgres connection pool.
- Keep `@libsql/client` out of this provider; Drizzle Kit can otherwise select the legacy driver.

Drizzle Kit converts the Cloud URL to HTTPS for its bundled SDK. Your application can keep the original Turso URL.

Learn more in the [Drizzle Turso guide](https://orm.drizzle.team/docs/sqlite/connect-turso-serverless) and [Turso SDK reference](https://docs.turso.tech/sdk/ts/reference).

## PlanetScale Postgres

The generated project uses `pg` with `drizzle-orm/node-postgres`. Tables use `drizzle-orm/pg-core`.

| Connection            | Variable              | Endpoint             |
| --------------------- | --------------------- | -------------------- |
| Application queries   | `DATABASE_URL`        | PgBouncer, port 6432 |
| Migrations and Studio | `DATABASE_URL_DIRECT` | Direct, port 5432    |

Copy TLS-enabled connection strings from PlanetScale and keep `sslmode=verify-full`. Give each connection role the permissions it needs.

### Connection pooling

The application reuses one `pg.Pool` per process and database environment. It registers the pool with Vercel's `attachDatabasePool` for idle connection cleanup.

Default limits in `src/db/connection.ts`:

| Setting                          | Default    |
| -------------------------------- | ---------- |
| Maximum connections per instance | 5          |
| Connection/acquisition timeout   | 5 seconds  |
| Idle timeout in production       | 5 seconds  |
| Idle timeout in development      | 10 seconds |

The connection timeout does not limit query duration. Size the pool for your database capacity and number of live instances; measure before reducing it. Longer idle timeouts also extend Vercel's cleanup window.

Keep the existing pool across requests. Drizzle acquires/releases clients for queries and transactions. If you use `pool.connect()` directly, release its client in `finally`.

See [node-postgres pool sizing](https://node-postgres.com/guides/pool-sizing) and [Vercel connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions). Enable Fluid Compute in Vercel's project settings when using it.

## Initialization and troubleshooting

### What initialization changes

Dinvolt generates the initial migration after installing dependencies. Initialization accepts only that unchanged initial migration:

| Database state | Result |
| --- | --- |
| Empty | Creates the known initial tables and real migration history together |
| Exact matching schema and history | Read-only readiness check |
| Existing tables, missing history, or schema drift | Stops for manual review |
| Local schema or migrations changed | Stops; use reviewed regular migrations |

Checks compare columns, defaults, indexes, and constraints, under a transaction lock. Matching table names alone are insufficient. PlanetScale also checks that the application endpoint can read the ready auth schema.

Initialization never deletes existing data, adopts unknown tables, or applies future migrations automatically. The setup summary reports connection and schema readiness separately.

### Connection or initialization failed

Your project, credentials, and generated SQL are preserved. Fix the network, permission, or credential issue, then rerun the matching initialization command:

```sh
bun run db:init
```

A timeout can leave the commit result uncertain. Retrying inspects the persisted schema/history before taking further action.

### Existing schema is incompatible

Compare the saved SQL with the intended database and its migration history. Use an empty database or prepare a reviewed migration/recovery procedure for its existing data.

Keep unrelated objects and genuine migration history intact. Adding fake history or dropping tables to pass readiness checks can lose data.

## Environment file loading

Database tools use Next.js's environment loader. Existing process variables take precedence over files.

| Target | File order, highest priority first |
| --- | --- |
| Development | `.env.development.local`, `.env.local`, `.env.development`, `.env` |
| Staging/production | `.env.production.local`, `.env.local`, `.env.production`, `.env` |

There is no automatic `.env.staging` loading. Test mode follows Next.js test-file rules and skips `.env.local`.

Keep the separately named credentials in your ignored `.env.local`, or inject the exact suffixed names in a trusted migration job. Check inherited variables before remote operations, and restart processes after credential changes.

Explicit script targets remain authoritative after files load. Keep environment selectors in trusted server configuration and secrets out of `NEXT_PUBLIC_*` variables.
