# Dinvolt code registry

Edit the ordinary TypeScript/TSX sources declared in `registry.json`, then run the Dinvolt build to generate the registry JSON payloads in `dist/registry/`. Install the packaged block into a compatible Dinvolt starter with Better Auth and tRPC/Query setup:

```sh
npx dinvolt ui add @dinvolt/admin-panel --target admin
```

The block uses the selected admin profile's primitives and theme. Once installed, the application owns its source. Reinstalling unchanged files is a no-op; customized blocks require manual review and are never overwritten by this command. No remote registry server or automatic application update is involved.

Dinvolt icons are shared by admin and public components at `@/components/icons`. Installing another block reuses icons already recorded by Dinvolt without creating an area-specific copy. Unknown or customized files are preserved and require manual review.

These icons originate from Nucleo UI and retain Nucleo's separate licensing terms. Both icon-bearing blocks install `src/components/icons/LICENSE.nucleo`; keep this notice with the icons. See the [Nucleo license](https://nucleoapp.com/license/) before redistributing them outside the bundled product.

## Source organization

```text
registry/
├── registry.json
├── admin-panel/
│   ├── auth/          # Login, recovery, sign-out and server authorization
│   ├── shell/         # Protected layout, sidebar and verified identity
│   ├── home/
│   ├── users/         # List, detail, create/edit sheets and CSV route
│   ├── settings/
│   ├── data-table/    # Reusable table controls and URL state
│   └── components/    # Shared panel headers, tabs and other UI
└── shared/
    ├── actions/       # ActionButton, CopyButton, DeleteButton and transitions
    └── spinner/
```

Source directories describe responsibility; registry items describe installation. `admin-panel` includes the complete admin interface and shared actions. `public-actions` installs those same action sources with the public profile. `admin-spinner` remains an independently installable admin item backed by `shared/spinner/`. Shared icons remain in `catalog/ui/components/icons/`, and profile primitives remain in `catalog/ui/components/admin/` and `public/`.

`@dinvolt/admin-login` is a compatibility alias for `@dinvolt/admin-panel`, resolved by the CLI to the same packaged payload and canonical receipt name. Existing `admin-login` receipts are recognized: unchanged installations remain a no-op, and customized, incomplete or older-version blocks still require manual review. Installed paths, block versions and the historical `docs/licenses/shadcn-admin-login.txt` destination are preserved. Reorganizing source files does not migrate installed application code.

The login composition is adapted from shadcn/ui's [login-05](https://ui.shadcn.com/blocks/login#login-05), distributed under the MIT license. It adds email/password authentication using React Hook Form, Zod and Better Auth. See `LICENSE.shadcn` for the upstream notice.

The login prerenders its logo, heading and usable form without a session-dependent server boundary or authentication skeleton. `LoginScreen` uses Better Auth’s client session query after hydration; it preserves the form while pending or on a lookup error, replaces the route for administrators and shows access denied for ordinary accounts. This is presentation only: protected server pages, APIs and actions continue to verify the session and exact role. Avoid redirecting away from login based only on cookie presence in Proxy: stale cookies can cause redirect loops.

Keep all user-facing text in English, including validation, error messages and accessible labels. The admin document declares `lang="en"`.

The block installs `ActionButton` in `@/components/admin/ui/action-button`. It composes the existing Button and Spinner with the [text swap](https://transitions.dev/detail.html?t=text-states-swap) and [icon swap](https://transitions.dev/detail.html?t=icon-swap) transitions, without a motion dependency. Pass `pending`, `pendingLabel`, an optional `icon`, and a string action label as children. Icon sizes (`icon`, `icon-sm`, etc.) hide the visible label while preserving its accessible name. Both labels reserve their width; reduced motion swaps immediately. The caller owns the async operation, duplicate-action guard and errors. `DataTableExport` uses this for `Export CSV` → `Exporting…` until the CSV is handed to the browser, then restores the action. Background table refreshes retain their existing content without action feedback.

Text-only actions show a centered label at rest, then animate the shared Spinner beside the pending label. Space for the pending content is reserved so the button does not resize. `LoginForm` uses this for `Sign in` → Spinner + `Signing in…`, driven by React Hook Form's `isSubmitting`. The submit action stays disabled during the authentication request and returns to idle on an error, preserving the entered credentials and validation feedback.

`SignOutButton` follows the same pattern with `Sign out` → Spinner + `Signing out…`. The user menu composes the exported `ActionButtonContent` inside its original DropdownMenuItem, replacing LogOut with the Spinner while keeping its menu semantics and keyboard controls. Both share `useAdminSignOut`, prevent repeated activation while pending and restore the action with an error on failure.

```tsx
<ActionButton
  icon={<FileDownload />}
  onClick={download}
  pending={pending}
  pendingLabel="Exporting…"
  size="sm"
  variant="outline"
>
  Export CSV
</ActionButton>
```

The protected `/admin/home` page uses a shared inset sidebar adapted from [shadcn sidebar-08](https://ui.shadcn.com/blocks/sidebar#sidebar-08). It includes Home navigation, a link to the public website, a responsive mobile drawer and a user menu with the authenticated administrator’s name, email and sign-out action. The protected layout prerenders the shell and streams only the verified `{ id, name, email }` identity through a TanStack hydration boundary. `useAdminUser` reads that identity without another browser session request; it controls presentation and query scoping, while every protected API/data/action boundary still authorizes on the server. Home renders its heading and welcome text immediately, with a placeholder only for the account name. The internal playground includes Home previews for the default, pending, error and skeleton states. Existing installed blocks remain application-owned and require manual migration.

`/admin/users` lists Better Auth users through the protected `admin.users` tRPC query. Name, email and ID share one literal substring search (450 ms debounce, Enter to apply immediately, clear to reset), combined with an All roles/Admin/User dropdown. Search, role, sort and pagination live in the URL; filters reset the page, browser Back/Forward restores them, and unrelated parameters survive. Native history updates avoid an additional Server Component request. Sorting and pagination run in the database, with bounded page sizes (10/20/50/100), whitelisted sort fields and ID as a stable tie-breaker. Only the displayed columns leave the server; each request revalidates the Better Auth session and exact admin role.

The reusable `DataTable`, `DataTableSearch`, `DataTablePagination` and `useDataTableState` live in the admin component/hook directories. Shared Zod schemas and URL codecs are in `src/lib/table-query.ts`; extend the base schema for another entity, whitelist that entity’s sort/filter values on the server and reuse the same controls. Queries use tRPC keys scoped to the current administrator, a 60-second stale time, five-minute garbage collection and automatic stale revalidation on mount, window refocus and reconnect. Fresh results are reused when returning to a list; stale results refresh in the background. The heading, description, search, role filter, table headers, page-size selector and pagination buttons prerender immediately. Initial skeletons replace only table cells and unknown counts; query execution waits for both the verified identity and the browser URL so a deep link never fetches the default filter first. `DataTableStateSync` is a browser-only observer and keeps the URL store aligned with Next navigation without suspending the static interface; native history updates and Back/Forward remain local. Existing rows, counts and sorting indicators stay visible during updates; only unresolved dynamic values use initial skeletons. There is no manual refresh control. Background updates show no visible loading state and keep valid pagination controls available. A contextual retry appears only after an error. Invalidate `trpc.admin.users.pathKey()` after user mutations; identity changes cancel and clear all queries. Unauthorized/forbidden responses clear the cache and return to login.

The internal playground uses synthetic tRPC responses isolated from the real endpoint. No schema migration is needed. Existing installed blocks remain application-owned and require manual migration; installation requires the matching tRPC starter files. Substring search uses escaped bound SQL parameters in both supported database dialects. It does not provide full-text indexes or a production performance benchmark.

The Users toolbar includes **Export CSV**, using Dinvolt's FileDownload icon. The authenticated `/api/admin/users/export` download shares the list's search/role predicates and deterministic sort, ignores `page`/`perPage`, and exports every matching user. The server reads sequential batches of 500 using a sort cursor instead of loading all users or issuing one request per visible page. CSV uses `;`, quoted/escaped cells, CRLF and a UTF-8 BOM for spreadsheet compatibility; potentially executable spreadsheet formulas are emitted as text. Columns are ID, name, email, role, email verification, status and created date (ISO UTC). An empty result exports only the header. The route revalidates the current admin session and returns private `no-store` responses; anonymous, ordinary and revoked admins cannot export. Downloads run only on an explicit click, prevent duplicate in-flight requests, keep the table visible and show a safe error on failure. `DataTableExport` and `src/lib/csv.ts` can be reused for other admin entities.

## Settings examples

The panel includes `/admin/settings` and `/admin/settings/preferences` as example forms with shared tabs, field validation, local image previews and discard controls. **Preview changes** updates only the form's local state; it does not save settings, upload files or change site configuration. Connect these forms to authorized server operations and persistent storage before using them as application settings.

## CopyButton

`CopyButton` composes the area's Button and accepts the exact text to copy in `value`. Wrap display content as `children`, or omit it to display `value`. `inline` preserves the surrounding text height and spacing. It forwards Button variants, sizes, classes, refs and event handlers, defaults to a small ghost button, and always uses `type="button"`. Icon-only sizes keep an accessible name. The trailing Copy icon swaps to Check only after the Clipboard API succeeds, then resets after two seconds. Copying again restarts the timer. Errors show retry feedback; unmounting or changing `value` clears feedback and cancels its timer. The shared icon transition respects reduced motion and preserves dimensions.

It installs at `@/components/admin/ui/copy-button` with the admin panel and `@/components/ui/copy-button` with public actions. The user detail uses a compact instance for email without increasing the field height. Copy and Check icons are shared at `@/components/icons/outline`.

```tsx
<CopyButton value={user.email} aria-label="Copy email">
  {user.email}
</CopyButton>
```

## DeleteButton

`DeleteButton` is installed alongside ActionButton at `@/components/admin/ui/delete-button`. The first activation shows `Are you sure?`; a second deliberate activation calls `onDelete`. Clicking/tapping outside, moving keyboard focus away or pressing Escape cancels confirmation. Double-clicks and held Enter/Space do not skip confirmation. The button always uses `type="button"` so it does not submit a surrounding form.

Pass the operation's `pending` state to disable repeat activation and show `Deleting…`. Like ActionButton, the caller owns the operation, its duplicate-request guard and error reporting. Confirmation is consumed before `onDelete`, so completion or failure returns to the first step. Customize `children`, `confirmLabel`, `pendingLabel`, `icon` (`null` for text only), `size` and `variant`. The default destructive button swaps its trash icon for a warning at confirmation and the shared Spinner while pending. The default icons come from Dinvolt's outline Trash and CircleWarning. The button starts at its current label's natural width and animates wider or narrower as the visible text changes, including returning from confirmation. It shares ActionButton's reduced-motion-aware text/icon transitions; icon-only sizes retain their fixed size, accessible names and a warning icon. ActionButton itself continues to reserve its label widths.

```tsx
<DeleteButton
  onDelete={() => deleteMutation.mutate({ id })}
  pending={deleteMutation.isPending}
  confirmLabel="Delete this record?"
>
  Delete record
</DeleteButton>
```

## Public action buttons

Install the public actions block to use `ActionButton`, `ActionButtonContent`, `CopyButton` and `DeleteButton` from their corresponding `@/components/ui/` modules. They expose the same props and behavior documented above, composed with the public Button, Spinner and theme. Confirmation icons are installed in `@/components/icons/outline`. The block includes the same Dinvolt SVG `Spinner` as admin, installed at `@/components/ui/spinner`, including for custom public presets.

```sh
npx dinvolt ui add @dinvolt/public-actions --target public
```

Both blocks deliberately reuse the editable action sources in `shared/actions/`; registry destinations and the selected profile resolve imports to each area's own components. Public actions do not require Better Auth or admin UI. Installation preserves customized block files. Only explicit operations show pending feedback; page loading and background refreshes retain the existing rendering conventions.
