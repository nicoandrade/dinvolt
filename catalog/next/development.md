# Local development

Use Node.js 24 or later and the package manager selected when creating this project. Run `bun dev`, `npm run dev`, `pnpm dev`, or the equivalent for your package manager, then open [**DEVELOPMENT_URL**](__DEVELOPMENT_URL__). The project's `dev` script runs Next.js through the pinned local Portless dependency; no global install is needed.

Portless starts its HTTPS proxy automatically and assigns Next.js an internal port. Leave `PORT` to Portless instead of adding a fixed `--port` to the development script. The explicit hostname uses the chosen project name, even if the folder is renamed or the project is opened in a Git worktree. Dots and underscores become hyphens; long names receive a shortened DNS label with a hash.

On first use, Portless may request administrator access to trust its local certificate authority and bind HTTPS port 443. Complete that setup when prompted. For certificate issues, run your package manager's local `portless trust` command (for example, `bunx --no-install portless trust`). See the [Portless HTTPS guide](https://portless.sh/https).

<!-- BEGIN:auth -->

`BETTER_AUTH_URL` is already set to `__DEVELOPMENT_URL__` in `.env.local` and `.env.example`. Keep it aligned with the development URL if you change the hostname or proxy settings. Set it to the deployed public origin in production. Preserve the unique `BETTER_AUTH_SECRET` generated in `.env.local`; see `docs/auth.md`.

<!-- END:auth -->
