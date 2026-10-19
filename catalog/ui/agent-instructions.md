<!-- BEGIN:dinvolt-ui -->

## Dinvolt UI

Use these conventions as defaults, adapting them to the current project and the user's explicit requests. Check which components and tools remain available; paths below are starter defaults. Reuse current patterns without restoring removed starter features just to follow this guide.

### Shared conventions

- Identify the feature's area before choosing components. Reuse that area's primitives, theme and patterns; components with the same name in different areas are not interchangeable. Keep shared icons in `@/components/icons` and reuse them wherever needed.
- Follow the area's form conventions, reusing React Hook Form, Zod and Field when available. Include realistic example-value placeholders wherever supported, such as `Alex` or `alex@example.com`, alongside meaningful labels. Match the area's language, validation and error feedback.
- Where an icon clarifies the expected input, use `InputGroup`, `InputGroupInput` and `InputGroupAddon` from that area. Prefer shared Dinvolt icons in `@/components/icons`; if none fits, use the area's configured icon library, usually selected through shadcn/ui. Keep labels and placeholders alongside icons.
- Explicit async actions should use the area's action component with real pending state, descriptive progress text and its existing spinner, animation, sizing and accessible feedback. Guard duplicate submissions, handle success/errors and clear pending on completion or failure.
- For shadcn/ui additions, prefer `npx dinvolt ui add <component>`. It uses the default profile in `.dinvolt/ui/config.json`; pass `--target` to select another installed area explicitly.

### Admin area

Applies to `src/app/(admin)` and `src/components/admin`, including `@/components/admin/ui`.

- Keep the sign-in form at `/admin`; the starter Home lives at `/admin/home`. Send successful sign-ins and authenticated admin visits to Home, and logout/expired sessions to `/admin`. Keep the entry outside the protected layout.
- Integrate pages with the current protected layout and navigation. Reuse `PageHeader` when available for the title, optional description and primary action in `actions`.
- For dynamic breadcrumb labels, use `useAdminBreadcrumb` with the page's existing authorized data, current path, parent link and verified identity. Avoid a separate read just for the label.
- Reuse `BackButton` when available for back navigation, passing an explicit `href` and contextual label. Its default `back` variant has no horizontal padding or hover background and a subtle back icon; `ghost` is available for auth-screen navigation.
- For navigation between related pages, reuse `AdminTabs` in their shared layout when available. Its items are links to separate routes, with a selector on mobile. The starter Settings forms are temporary examples; connect real configuration to authorized server reads and writes before presenting it as saved.
- For lists, reuse available admin components such as `DataTable`, `DataTableSearch`, `DataTablePagination` and `useDataTableState`. Keep consistent styling and filter, sort and pagination behavior; adapt columns, filters and actions to the resource.
- Prefer `ActionButton` when available, with real `pending` and a descriptive `pendingLabel`, such as `Saving…`. In menus, reuse `ActionButtonContent` when available while preserving menu semantics, keyboard behavior and accessible progress.
- For destructive actions, prefer `DeleteButton` when available (initially `@/components/admin/ui/delete-button`). Connect the operation to `onDelete`, pass its real `pending` state and adapt the action, `confirmLabel` and `pendingLabel` text. Reuse its built-in confirmation and progress feedback; the caller owns the operation, duplicate-request guard and error handling.
- Preserve the admin theme scope in `src/app/globals.css` and `admin-panel` on the admin layout's `<html>` so portals inherit it.

### Public area

Applies to `src/app/(public)` and its components, with primitives in `@/components/ui`.

- Integrate pages with the public site's current layout and navigation. Reuse its available headers, lists, forms and other visual patterns, adapting them to the content.
- Prefer the public `ActionButton` when available, with real `pending` and a descriptive `pendingLabel`, such as `Saving…`. In menus, reuse `ActionButtonContent` when available while preserving menu semantics, keyboard behavior and accessible progress.
- For destructive actions, prefer the public `DeleteButton` when available (initially `@/components/ui/delete-button`). Connect the operation to `onDelete`, pass its real `pending` state and adapt the action, `confirmLabel` and `pendingLabel` text. Reuse its built-in confirmation and progress feedback; the caller owns the operation, duplicate-request guard and error handling.
- Use the public theme and primitives. Reuse icons from `@/components/icons` when available.
- When adding Dinvolt's public action components fits the project, use `npx dinvolt ui add @dinvolt/public-actions --target public`.

### Rendering and loading

- Prerender static UI immediately: navigation, headings, forms, filters, table headers and known pagination controls stay outside session/data waits. Scope Suspense and layout-matched skeletons to initially missing dynamic fragments; an empty result is data.
- During background updates, retain usable data and controls without spinners, loading text or overlays. Reserve action feedback for explicit operations.
- Check slow initial loads and background refreshes: static controls stay mounted and usable, layout and input are preserved, private data waits for server authorization, and session/data requests are not duplicated.

<!-- END:dinvolt-ui -->
