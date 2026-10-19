# Dinvolt playground

From the repository root:

```bash
bun install
bun run playground
```

Open [localhost:3100/playground](http://localhost:3100/playground). The first run creates `demos/dinvolt-playground` with the same generator, default UI profiles, Turso/Better Auth/tRPC setup and shadcn installation used by `dinvolt create`. It skips downloading agent skills, which do not affect the rendered app. Subsequent runs reuse that application and its dependencies. No global CLI installation, new demo wizard or database credentials are needed for previews. The server binds to loopback and uses HTTP on port 3100 instead of Portless.

## Catalog and showcase

The default view is the official shadcn preview board adapted to Dinvolt, without its design-system editor. Switch between **Admin · Vega** and **Public · Luma**, use the component search to open individual examples, or choose the existing Dinvolt login and spinner examples. Each profile contains 65 catalog entries. The Form entry uses the Field form composition, as Base UI has no separate legacy Form component.

Production primitives live in `catalog/ui/components/admin/` and `catalog/ui/components/public/`. They are the same editable sources consumed by `dinvolt ui add`, including when `create` installs the admin panel's dependencies. Both profiles install the Dinvolt spinner from its single editable source, `catalog/registry/shared/spinner/spinner.tsx`; the vendored upstream spinner is preserved as reference.

`showcase/` holds the shared upstream preview compositions. `component-examples/` holds the individual component examples. Their imports are adapted into each profile only in the ignored generated application. The upstream commit and registry URLs are recorded in provenance files; MIT notices are retained. Theme/font/icon editor dependencies are replaced by fixed profile values. AI examples use sample data and the waveform is synthetic; these demos do not need an AI service or microphone access. Questionnaire uses a focused local example because the imported multi-instance demo triggers a render loop with the pinned upstream primitive package; its component source is unchanged.

## Editing

- Edit primitives in `catalog/ui/components/<profile>/` and application blocks in `catalog/registry/`, not in the generated demo.
- Edit default CSS and layouts in `catalog/ui/`. The playground shares the production layout's tRPC-provider transformation.
- Changes are synchronized on save. Next.js Fast Refresh updates the iframe; ordinary form edits preserve input state when React can retain the component.
- Registry files use upstream shadcn's own file updater, including aliases and cross-file import resolution. Required primitives and package dependencies are installed when registry dependencies or UI profiles change.
- The actual `/admin`, `/admin/home`, `/admin/users` and `/` routes remain available. "Real application" opens the original login route inside the gallery. It requires database setup to submit a real login.
- For changes to Next.js, auth, database or other infrastructure templates, stop the server, move `demos/dinvolt-playground` to a backup outside that path, then run the command again. Keep any needed local environment values private.

The generator owns `demos/dinvolt-playground`. Synchronization requires an internal ownership marker and cannot target another project. The generated files, gallery, worker, tests and credentials are excluded from the published package by the root `files` allowlist.

## Scenarios

Choose a profile and search examples in the sidebar. **Public site → Home page** embeds the real public `/` route in either profile. **Admin panel** groups the admin home, users, user detail, settings, login, access error, login form and sign-out examples; shared Dinvolt controls remain in their own group. The preview toolbar contains the scenario selector, viewport buttons and light/dark theme controls. On mobile, open the navigation sheet from the top bar; it closes when you choose an example and supports Escape and keyboard focus management. Searching and resizing preserve the active iframe and its form state. These selections are stored in the playground URL, so refreshing, sharing a link and navigating back or forward restore the same preview. For example, `/playground?section=ui%3Abutton&profile=public&theme=dark&viewport=390` opens the public Button preview in dark mode at mobile width. "Open preview" opens its standalone URL. For submitting/error scenarios, enter any valid email and a nonempty password, then submit. Validation uses the original browser constraints and form schema.

Scenario pages live under `/preview/`. A service worker scoped to that path returns deterministic authentication errors, a pending request or a network failure. The login form is visible immediately and stays mounted while interception initializes; preview interactions remain inert until the worker is ready. Data previews render their static content immediately and enable queries only after interception is ready; initial placeholders cover only rows and unknown counts. The worker never controls the real `/admin` routes or modifies server authorization. Mock state is selected from the preview URL, so standalone previews are reproducible.

CSV previews simulate 800 ms of processing by default so `Exporting…` and the Spinner are visible before the download. This delay is confined to the preview worker; table queries remain immediate unless an explicit `delay` parameter is supplied, and real exports retain their actual request duration. Use `delay=0` on the standalone preview to test an immediate response.

`LoginView` and `AccessDenied` live in the shipped registry alongside the login form. Both the real page and preview use those components. The preview's form container and scenario selection are internal presentation scaffolding.

The **Spinner** example imports `@/components/admin/ui/spinner`, installed from `catalog/registry/shared/spinner/spinner.tsx`. Its default, sizes and disabled-button scenarios all use that same component. `create` and playground bootstrapping install the shared list of default admin blocks, including this spinner.

The [**Action button** example](http://localhost:3100/playground?section=action-button) uses the installed `ActionButton` to exercise icon-and-text, text-only, icon-only and login actions (`Sign in` → Spinner + `Signing in…`). Every pending variant shows the shared Spinner; text-only actions center their label at rest and reveal the spinner beside the pending label without resizing. Its brief simulated operation exists only in the preview. The login form and Users export use their actual request's pending state. All share the text/icon transitions and respect reduced motion.

To add another example:

1. Add its production source to the registry and declare its dependencies.
2. Add its label and scenarios to `components/examples.ts`.
3. Add its rendering case to `components/preview.tsx`, importing the installed source rather than copying its markup.

For shadcn primitives, update the selected profile's `registry.json` and source, then add a shared `component-examples/<name>-example.tsx`. The component list and profile-specific previews are generated from the catalog automatically.

## Browser checks

For the full catalog (all entries in both profiles):

```bash
bun run playground:test:catalog
```

This also runs the existing login and gallery checks. It verifies that every component example renders in the actual profile layout and reports browser runtime errors. Keep external example images distinct from production assets.

Install Chromium once, then run:

```bash
bunx playwright install chromium
bun run playground:test
```

The check starts the playground if necessary, compares the login preview with the generated app's actual login at desktop/mobile sizes in light/dark mode, and tests validation, errors, pending, denied access, logout errors, skeletons, mock interception, gallery controls and browser runtime errors. Screenshots go to the ignored `demos/playground-checks/` folder. It requires no database.

For an independent comparison, create a fresh project with `dinvolt create` using defaults, start it on another loopback port, then pass its origin:

```bash
bun run playground:test --reference http://localhost:3101
```

Pixel equality verifies the rendered login in the tested states and sizes; it does not verify real authentication or every possible custom preset. Real database tests must follow the root internal testing instructions, use a separate generated Turso demo with verified internal credentials, inspect the shared schema before migrations, and clean up only their own fixtures. The playground does not automatically load `.env.demo.local`.

The [Delete button example](http://localhost:3100/playground?section=delete-button) exercises two-step deletion with icon-and-text, text-only and icon-only buttons. Try outside-click, touch, Escape and focus cancellation; pending, disabled and failed-deletion scenarios are available. Operations are simulated locally and never delete real records.

The public profile includes [Action button](http://localhost:3100/playground?profile=public&section=action-button) and [Delete button](http://localhost:3100/playground?profile=public&section=delete-button). Switch between profiles without losing the selected action example. The previews use the installed `@dinvolt/public-actions` components, public Luma primitives and public theme, with the same interactive scenarios as admin. Operations are simulated locally; no session or database is required. The synchronizer derives public scenario files from the existing action previews so behavior stays consistent without importing admin components into the public preview.

The [public Spinner example](http://localhost:3100/playground?profile=public&section=ui%3Aspinner), public ActionButton and public DeleteButton all use the same Dinvolt SVG spinner as admin, with 500 ms rotation and reduced-motion support.
