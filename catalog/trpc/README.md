# tRPC and TanStack Query

Use tRPC for typed application APIs and TanStack Query to fetch, cache, and refresh data in the browser.

This guide applies to **Public website + admin panel** projects.

The generated project already includes both providers, a working health query, and protected account/admin procedures. No extra installation is needed.

## Read data in client components

Create a Client Component that uses the existing health query:

```tsx
// src/components/api-status.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/trpc/client";

export function ApiStatus() {
  const trpc = useTRPC();
  const query = useQuery(trpc.health.queryOptions());

  return (
    <section aria-labelledby="api-status-title">
      <h2 id="api-status-title">API status</h2>
      {query.data ? (
        <output>{query.data.status}</output>
      ) : query.isError ? (
        <p role="alert">API status is unavailable.</p>
      ) : (
        <Skeleton className="h-5 w-16" />
      )}
    </section>
  );
}
```

Render `ApiStatus` from a page. Its heading appears immediately; only the unresolved status has a skeleton. Existing data stays visible during a background refresh.

### Included procedures

| Procedure      | Access                     | Result                    |
| -------------- | -------------------------- | ------------------------- |
| `health`       | Public                     | Status and timestamp      |
| `auth.me`      | Signed-in, non-banned user | Safe profile fields       |
| `admin.status` | Administrator              | Authorization status      |
| `admin.users`  | Administrator              | Paginated, filtered users |
| `admin.user`   | Administrator              | One user's display fields |

SuperJSON preserves dates through HTTP and server hydration, so the health timestamp remains a `Date`.

## Add a protected procedure

Choose the least permissive procedure that fits the operation:

| Helper | What it verifies |
| --- | --- |
| `publicProcedure` | No session required |
| `protectedProcedure` | Valid session and non-banned account |
| `adminProcedure` | Valid session, non-banned account, and exact `admin` role |

For example, create a feature router that validates its input and uses the verified session:

```ts
// src/trpc/routers/greeting.ts
import "server-only";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const greetingRouter = createTRPCRouter({
  message: protectedProcedure
    .input(z.object({ topic: z.string().trim().min(1).max(100) }))
    .query(({ ctx, input }) => ({
      message: `Hello ${ctx.session.user.name}. Let's discuss ${input.topic}.`,
    })),
});
```

Import `greetingRouter` into `src/trpc/routers/app.ts` and add it to the existing root router under the `greeting` key. The typed client then exposes the query:

```tsx
const greeting = useQuery(
  trpc.greeting.message.queryOptions({ topic: "your project" })
);
```

For database operations, use `ctx.getDb()`. Validate resource ownership or tenant access inside each procedure, even when the user is signed in or has an admin role.

Keep password, account, and session mutations in Better Auth's `authClient`; its management endpoints already implement their auth rules.

## Read data on the server

Server Components can call the router directly, without an HTTP request to their own app.

This example keeps the title outside the request-time boundary:

```tsx
// src/app/api-status/page.tsx
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCaller } from "@/trpc/server";

async function StatusValue() {
  await connection();
  const health = await getCaller().health();
  return <output>{health.status}</output>;
}

export default function Page() {
  return (
    <main>
      <h1>API status</h1>
      <Suspense fallback={<Skeleton className="h-5 w-16" />}>
        <StatusValue />
      </Suspense>
    </main>
  );
}
```

For a private server read, choose the protected procedure for that data. Keep auth-dependent calls outside shared `use cache` functions and process-global caches.

## Prefetch and hydrate

Prefetch when a Client Component needs initial server data and later browser updates.

### 1. Create the query component

```tsx
// src/app/(admin)/admin/(protected)/profile/profile-details.tsx
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export function ProfileDetails() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.auth.me.queryOptions());

  return (
    <p>
      {data.name} · {data.email}
    </p>
  );
}
```

### 2. Prefetch inside a narrow boundary

This example is an administrator page. It authorizes the route before prefetching:

```tsx
// src/app/(admin)/admin/(protected)/profile/page.tsx
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/admin-auth";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { ProfileDetails } from "./profile-details";

async function ProfileData() {
  await connection();
  await requireAdmin();
  void prefetch(trpc.auth.me.queryOptions());

  return (
    <HydrateClient>
      <ProfileDetails />
    </HydrateClient>
  );
}

export default function Page() {
  return (
    <main>
      <h1>Profile</h1>
      <p>Your account details.</p>
      <Suspense fallback={<Skeleton className="h-5 w-64 max-w-full" />}>
        <ProfileData />
      </Suspense>
    </main>
  );
}
```

With Next.js Cache Components, establish request time before using the prefetch/hydration helpers. Awaiting `connection()` under Suspense does this; awaiting request headers or cookies also establishes the boundary.

The server QueryClient is request-scoped. Pending queries can stream to the browser, where a stable QueryClient reuses them. A failed authenticated prefetch does not replace route authorization.

References: [tRPC App Router setup](https://trpc.io/docs/client/nextjs/app-router-setup), [TanStack Query advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).

## Refresh data after changes

After a successful mutation, invalidate the affected query. For example, call this in a Client Component after creating or editing a user:

```tsx
// src/hooks/use-refresh-users.ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export function useRefreshUsers() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return () =>
    queryClient.invalidateQueries({
      queryKey: trpc.admin.users.pathKey(),
    });
}
```

The built-in user forms already do this. Path invalidation also matches administrator-scoped query keys.

For your own tRPC mutations, use TanStack's `useMutation` with the procedure's `mutationOptions()`, then invalidate or update the relevant cache in its success handler.

### Freshness and revalidation

| Query                   | Freshness  |
| ----------------------- | ---------- |
| Shared default          | 30 seconds |
| Admin user list/details | 1 minute   |

Fresh data is reused. Stale data can revalidate on mount, window focus, or reconnect while the previous result stays visible.

`staleTime` does not start a polling timer. Add polling only when the product needs periodic updates, and choose retries/freshness for the feature.

Use automatic revalidation and targeted invalidation for routine updates. Show a contextual **Try again** action when an error needs recovery.

## Clear data after identity changes

Cancel and clear browser queries after successful login, logout, or account switching, before full navigation:

```ts
// src/lib/sign-out.ts
"use client";

import { authClient } from "@/lib/auth-client";
import { resetQueryCache } from "@/trpc/query-client";

export async function signOut() {
  const { error } = await authClient.signOut();
  if (error) {
    return { error: "Unable to sign out. Please try again." };
  }

  await resetQueryCache();
  window.location.assign("/");
}
```

Handle auth errors before clearing data or navigating. Apply the same reset after successful sign-in/sign-up and identity or role switches.

Private calls always revalidate authorization on the server. A browser cache is never proof of permission.

## Build loading and error states

Render static page structure immediately: headings, descriptions, fields, filters, table headers, and known pagination controls.

| State               | What to show                                          |
| ------------------- | ----------------------------------------------------- |
| First read, no data | Matching skeletons for unresolved values or rows      |
| Empty result        | The empty state; loading is complete                  |
| Background refresh  | The current data                                      |
| Recoverable error   | Contextual error and retry, preserving usable content |

For filter/page changes within the same identity, preserve prior rows with `placeholderData` or `keepPreviousData`. Do not carry private placeholders across identities.

Background fetching should not add spinners, loading text, dimming, overlays, or controls disabled solely by `isFetching`.

The generated `AGENTS.md` includes these conventions for new screens. Client Components can prerender static HTML too.

References: [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [window-focus refetching](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching).

## Reusable admin tables

The Users page is a working reference for a searchable, sortable list with URL state.

### Reuse the existing pieces

| Source                   | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `src/lib/table-query.ts` | Base Zod schema, allowed sizes, and URL helpers |
| `src/lib/users-query.ts` | User-specific role and sort validation          |
| `DataTable`              | Columns, rows, and initial row skeletons        |
| `DataTableSearch`        | Debounced search                                |
| `DataTablePagination`    | Page and size controls                          |
| `useDataTableState`      | URL synchronization                             |

Extend the schema for another entity and keep its columns/query separate. Validate authorization and select only display fields in each list endpoint.

### URL behavior

- Search waits 450 ms and replaces the current history entry.
- Filters, sort order, and page size reset pagination together and push history.
- Back/Forward restores state without a server navigation.
- Unrelated URL parameters are preserved; default values are omitted.
- Out-of-range pages are clamped by the server.

### Private query behavior

Users queries wait for the server-verified administrator identity and browser URL. Query keys include that identity and the filters.

The list keeps data fresh for one minute, removes unused queries after five minutes, supports cancellation, and disables automatic retries. Stale results refresh on mount, focus, or reconnect. Extra page prefetching is unnecessary.

Initial skeletons cover cells and unknown totals at the requested page size. Static table controls remain visible; background updates preserve existing rows and counts.

## Export filtered CSV

On `/admin/users`, click the export control to download all matching users. It respects the current search, role, and sorting, without limiting the result to the visible page.

The export route is `/api/admin/users/export`. It authorizes the administrator independently and reads batches of 500 rows.

To add export to another list:

1. Share its selection, filters, order, and cursor predicates between the list and export. Users does this in `src/trpc/routers/users-data.ts`.
2. Define an export input schema without pagination. Users uses `usersExportQuerySchema`.
3. Build the response with `createCsvResponse` from `src/lib/csv.ts`.
4. Reuse `DataTableExport` for the download control.

Export does not change records or populate the TanStack query cache. Preserve existing content and sanitized errors if a download fails.

## File reference

| File | Responsibility |
| --- | --- |
| `src/trpc/context.ts` | Lazy database access and request-local session lookup |
| `src/trpc/init.ts` | Router helpers, authorization, and validated errors |
| `src/trpc/routers/app.ts` | Root application router |
| `src/trpc/client.tsx` | Client provider and hooks |
| `src/trpc/server.tsx` | Direct calls, prefetching, and hydration |
| `src/trpc/query-client.ts` | QueryClient factory and identity reset |
| `src/app/api/trpc/[trpc]/route.ts` | HTTP handler |

Browser calls use `/api/trpc` and its same-origin session cookie. POST requests must send a matching `Origin`; server-to-server clients need that header too. Server Components should use the direct helpers.

HTTP responses are `no-store`, and unexpected internal errors are sanitized. Session/role data and private results stay outside shared Next.js caches.

Public procedures avoid auth/database reads unless they request them. Missing session cookies return no session before initialization; present cookies always go through Better Auth. Keep the cookie helper aligned if its name or prefix changes.
