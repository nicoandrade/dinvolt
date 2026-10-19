# Local end-to-end verification

From the repository root, run:

```sh
bun run test:e2e
```

This is an internal, on-demand check. It does not run as part of `bun run check`, create GitHub workflows or deploy anything. It requires Node.js 24+, Bun, network access to install starter dependencies and reach Turso, and Playwright Chromium. If Chromium is missing, install it once with `bunx playwright install chromium`.

The root ignored `.env.demo.local` must contain `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for the disposable internal test database. The runner reads only these two values, without executing the file or printing them. It strips inherited database/deployment/auth settings and injects explicit development credentials and a fresh auth secret into child processes. Before remote operations, the worker loads the generated app's dotenv files and checks its effective database selector and credentials against that internal source. Missing setup or a mismatch fails the run; it never falls back to another database.

## What a passing run establishes

1. The current local CLI and registry build.
2. The compiled CLI runs with Node and creates a fresh public/admin app: Bun, Oxlint/Oxfmt, Turso, Better Auth and tRPC. Agent skill downloads are skipped; they do not affect this runtime flow.
3. The generated initial migration matches the shared database. An empty database receives the generated migration through the existing initializer. An already initialized database must have the same initial SQL hash and complete schema; its migration history is preserved, including the original timestamp. Differences stop the run before account writes. The runner never resets or baselines the shared database.
4. The generated authentication tooling creates a unique administrator. It deliberately uses the manual administrator helper, because the shared database may already have administrators; it does not promote or replace existing accounts.
5. A real Chromium browser signs in through the generated form, creates an ordinary user through the admin sheet, searches the user table and reloads it. The test independently verifies that user and credential account persisted in Turso, and checks the filtered CSV response.
6. Administrator logout removes access. Anonymous and ordinary authenticated users are denied by protected pages, tRPC administrator endpoints, CSV export and Better Auth user creation.
7. The browser raises no unhandled runtime errors. Run-owned accounts and their sessions/credential records are removed and cleanup is checked.

This is one supported reference path, not a matrix of package managers, linters, databases or deployment platforms. It exercises a local Next.js development server; production builds and deployed behavior require separate verification.

## Results and cleanup

Each invocation creates a fresh app and a sanitized `report.json` under ignored `demos/e2e-runs/<run>/`. The report records stages, status, durations and exact test account emails. The app remains available for inspection. Database credentials are injected into processes; they are not copied into the demo or distribution. No browser storage state, traces, screenshots, raw provider errors or passwords are saved in the report.

The command exits nonzero when any stage or cleanup fails. Cleanup runs on normal completion, failures and handled Ctrl+C/SIGTERM. It deletes only the three exact emails reserved for that run, including the attempted forbidden account, and their related auth records. Existing demo data and schema remain. If an empty database was initialized, those tables and the migration record remain for later runs.

A lock at `demos/e2e-runs/.lock` serializes this runner's executions. It does not lock unrelated manual database commands; avoid running other schema changes at the same time. After an uncatchable termination (for example SIGKILL), inspect the lock's PID and the report before removing a stale lock. Do not discard a failed run's app until its remote cleanup has been confirmed.

To retry only cleanup with verified internal credentials, use the run ID printed by the command:

```sh
bun run test:e2e --cleanup <run>
```

Cleanup is idempotent. It uses that run's generated dependencies and exact account emails, and updates `cleanup` in the report without changing the original test result. Once cleanup is confirmed, you may remove its local run directory to reclaim disk space.

These scripts and instructions are internal. The package's publication allowlist excludes `scripts/`, `demos/`, root `AGENTS.md` and `.env.demo.local`. Public `create` never loads the internal test credentials.
