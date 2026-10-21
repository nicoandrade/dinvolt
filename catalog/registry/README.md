# UI registry

For **Admin panel only** projects, the login is `/`, the home page is `/dashboard`, and other panel pages omit the `/admin` prefix. Components use `@/components` and `@/components/ui`. API endpoints such as `/api/admin/users/export` keep their paths. Examples below use the combined public website + admin panel layout; generated standalone guides use the app's actual paths.

Install editable components and complete UI blocks into your Dinvolt project. Your application owns the installed source, so you can customize it directly.

## Choose a block

| Block | Target | Use it for |
| --- | --- | --- |
| `@dinvolt/admin-panel` | `admin` | Login, a protected sidebar, Home, Users, settings examples and action buttons. |
| `@dinvolt/public-actions` | `public` | Save, copy and delete buttons for public pages. |
| `@dinvolt/admin-spinner` | `admin` | A standalone SVG Spinner. |

Projects created with **Public website + admin panel** or **Admin panel only** already include the panel and spinner. The panel requires the generated Better Auth and tRPC/Query integrations; the other blocks do not require authentication.

See [Admin panel](#admin-panel) for its pages and [Action components](#action-components) for usage examples.

## Install a block

Run this inside a compatible Dinvolt project. For public action buttons:

```sh
npx dinvolt ui add @dinvolt/public-actions --target public
```

For the admin panel:

```sh
npx dinvolt ui add @dinvolt/admin-panel --target admin
```

The legacy name `@dinvolt/admin-login` is still accepted as an alias for the admin panel.

## Add individual components

Use the same command for official shadcn/ui components:

```sh
npx dinvolt ui add button dialog --target public
```

The combined public website + admin panel project has separate profiles and themes. Public-only and admin-only projects each have one profile:

| Project type                 | Target   | Primitives and actions  |
| ---------------------------- | -------- | ----------------------- |
| Public website only          | `public` | `@/components/ui`       |
| Public website + admin panel | `public` | `@/components/ui`       |
| Public website + admin panel | `admin`  | `@/components/admin/ui` |
| Admin panel only             | `admin`  | `@/components/ui`       |

Icons live in `@/components/icons` in all three project types. Only installed targets are available: an admin-only app cannot install a public block. Without `--target`, Dinvolt selects public for public-only projects and admin for either project type with a panel.

## Update installed code

Reinstalling an unchanged block does nothing. Customized, incomplete or conflicting blocks require manual review; `--overwrite` does not replace them.

Catalog changes affect future installations. Review and apply changes to existing application code yourself. See the [CLI reference](../../docs/cli.md#dinvolt-ui-add) for installation options.

## Admin panel

The admin panel provides a starting point for managing your application. Select **Public website + admin panel** or **Admin panel only** in the creation wizard to include it.

Connect the database and create your first administrator before testing protected pages. Follow the [authentication guide](../auth/README.md).

### Open the panel

Start the application, then visit `/admin` and sign in with your administrator account.

| Route | What you can do |
| --- | --- |
| `/admin` | Sign in or request password recovery. |
| `/admin/home` | View the protected home page and account menu. |
| `/admin/users` | Search, filter, sort, create and edit users; export matching users to CSV. |
| `/admin/users/[userId]` | Open a user's details. |
| `/admin/settings` | Try the general settings form. |
| `/admin/settings/preferences` | Try the preferences form. |

Password recovery requires Resend and a configured sender. Settings forms are examples: **Preview changes** updates local state. Connect authorized server operations and storage to save settings or upload files.

### Reuse the page header

Use `PageHeader` to keep headings and toolbar actions consistent across admin pages:

```tsx
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/admin/ui/button";

export function ProductsHeader() {
  return (
    <PageHeader
      title="Products"
      description="Manage the products shown on your website."
      actions={<Button>Add product</Button>}
    />
  );
}
```

Connect the button to your own form, dialog or navigation. `titleId` is available when another element needs to reference the heading.

### Extend a data table

The panel includes `DataTable`, `DataTableSearch`, `DataTablePagination` and `useDataTableState` in the admin component and hook directories.

When adding another entity:

1. Reuse those controls and extend the schemas in `src/lib/table-query.ts`.
2. Validate allowed filters and sort fields on the server.
3. Authorize every query, mutation and export.
4. Invalidate the relevant tRPC queries after a mutation.

The Users page is the working example. Its URL preserves search, role, sort and pagination. CSV export includes every matching user, regardless of the visible page.

See [API and data](../trpc/README.md) for server and client patterns.

### Keep static controls visible

Render headings, form fields, filters, table headers and pagination immediately. Initial skeletons belong only around unresolved identity, rows and totals.

Keep existing rows visible during background updates. The server must continue to authorize protected pages, APIs and actions.

## Action components

Use these buttons for pending actions, clipboard copying and inline deletion confirmation.

Install the public block first:

```sh
npx dinvolt ui add @dinvolt/public-actions --target public
```

Projects with an admin panel already include these components. The imports below work in public-only and admin-only projects. For the admin area of a combined project, replace `@/components/ui/` with `@/components/admin/ui/`.

### Show a pending form action

`ActionButton` disables itself while pending and swaps its label without resizing the button.

Create a submit button for a React form action:

```tsx
"use client";

import { useFormStatus } from "react-dom";

import { ActionButton } from "@/components/ui/action-button";

export function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <ActionButton type="submit" pending={pending} pendingLabel="Saving…">
      Save changes
    </ActionButton>
  );
}
```

Render `SaveButton` inside a form that uses React's `action` prop. The form owns validation, saving and error feedback.

For other operations, pass your request's pending state directly. Required props are a string child label, `pending` and `pendingLabel`; `icon` is optional.

`ActionButtonContent` is exported from the same module when you need this presentation inside an existing control, such as a menu item.

### Copy text

`CopyButton` writes `value` to the clipboard. The displayed label can differ from the copied value:

```tsx
"use client";

import { CopyButton } from "@/components/ui/copy-button";

export function CopyEmail() {
  return (
    <CopyButton value="hello@example.com" aria-label="Copy email address">
      hello@example.com
    </CopyButton>
  );
}
```

Omit children to display `value` automatically. Use `inline` to fit the button into a line of text.

A successful copy shows a check for two seconds. A failed copy shows retry feedback. Button variants and sizes are supported; provide an accessible label for icon-only controls.

### Confirm a deletion

`DeleteButton` asks for confirmation on the first activation and calls `onDelete` on the second. Escape, an outside click or moving focus away cancels confirmation.

Connect it to your deletion operation:

```tsx
"use client";

import { DeleteButton } from "@/components/ui/delete-button";

type DeleteRecordButtonProps = {
  pending: boolean;
  onDelete: () => void;
};

export function DeleteRecordButton({
  pending,
  onDelete,
}: DeleteRecordButtonProps) {
  return (
    <DeleteButton
      pending={pending}
      onDelete={onDelete}
      confirmLabel="Delete this record?"
    >
      Delete record
    </DeleteButton>
  );
}
```

Pass the mutation's pending state to prevent repeat activation. Your operation owns authorization, deletion, error feedback and data refresh.

Customize the labels, `icon`, `size` or `variant` as needed. Both action and delete buttons respect reduced motion.

## Licenses

The panel adapts shadcn/ui's [login-05](https://ui.shadcn.com/blocks/login#login-05) and [sidebar-08](https://ui.shadcn.com/blocks/sidebar#sidebar-08) under MIT. Keep the installed license notices.

Nucleo icons retain their [separate license](https://nucleoapp.com/license/). Keep `src/components/icons/LICENSE.nucleo` with the icons.
