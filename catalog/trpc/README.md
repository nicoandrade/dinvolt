# tRPC and TanStack Query

The starter uses tRPC 11's `@trpc/tanstack-react-query` integration and TanStack Query 5, with server/client/prefetch helpers, Dinvolt's lazy database client and separate public/admin root layouts. Both layouts already mount `TRPCReactProvider`.

- `src/trpc/context.ts`: request-local session lookup through Better Auth and lazy `ctx.getDb()` for the selected Drizzle provider. Public procedures that do not need auth/database avoid those lookups.
- `src/trpc/init.ts`: typed router helpers, SuperJSON serialization, Zod validation errors, and public/authenticated/admin procedures. Unexpected internal errors are sanitized.
- `src/trpc/routers/app.ts`: the root `AppRouter`. Initial procedures are `health`, authenticated `auth.me` (safe user fields), and admin-only `admin.status`, `admin.users` (validated, paginated user search) and `admin.user` (a single user’s display fields).
- `src/app/api/trpc/[trpc]/route.ts`: GET/POST HTTP handler, no-store responses and same-origin POST checks. Browser calls use `/api/trpc` and its same-origin session cookie. Server-to-server POST clients must send the matching `Origin`; Server Components should use the direct server helpers.
- `src/trpc/query-client.ts`: shared factory with 30-second stale time, pending-query dehydration and SuperJSON hydration. Server requests never share a QueryClient; the browser keeps one stable instance. Dates remain Dates through HTTP and hydration.
- `src/trpc/server.tsx`: request-scoped `trpc`, `getQueryClient`, `getCaller`, `prefetch`, and `HydrateClient`. Server calls execute the router directly instead of making HTTP requests to this app.

Client components use the TanStack APIs:

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const ApiStatus = () => {
  const trpc = useTRPC();
  const health = useQuery(trpc.health.queryOptions());
  return <output>{health.data?.status}</output>;
};
```

For mutations, use `useMutation(trpc.example.create.mutationOptions({ onSuccess: ... }))` and invalidate the relevant `queryKey()`/`pathKey()` through `useQueryClient`. Validate inputs with Zod in the procedure, then use `ctx.getDb()` when needed. `protectedProcedure` provides a verified non-null `ctx.session`; `adminProcedure` additionally checks the exact `admin` role. Resource ownership and tenant authorization still belong in each procedure. Keep Better Auth mutations in `authClient`; do not duplicate password or session logic in tRPC.

Prerender static headings, descriptions and controls outside data boundaries. Put only the component that consumes unresolved data under Suspense; its fallback replaces only that dynamic fragment. Initial loading does not justify a skeleton for the whole page, form or table header. Client Components can prerender static HTML too.

For prefetch/hydration with Next.js Cache Components, use an async component under that narrow Suspense boundary and await `connection()` before calling the helpers. TanStack's query/dehydration timestamps also need a request-time boundary, even for public queries. Reading and awaiting `headers()`/`cookies()` first also establishes that boundary:

```tsx
import { Suspense } from "react";
import { connection } from "next/server";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Profile } from "./profile";

const ProfileData = async () => {
  await connection();
  void prefetch(trpc.auth.me.queryOptions());
  return (
    <HydrateClient>
      <Profile />
    </HydrateClient>
  );
};

const Page = () => (
  <main>
    <h1>Profile</h1>
    <p>View your account details.</p>
    <Suspense fallback={<Skeleton className="h-24 w-full" />}>
      <ProfileData />
    </Suspense>
  </main>
);
export default Page;
```

`Profile` renders only the fetched account details; the heading and description stay mounted while those details load. `Profile` can use `useSuspenseQuery(useTRPC().auth.me.queryOptions())`. For a server-only read, use `await getCaller().auth.me()`. Private/auth-dependent queries must not go in shared `use cache` functions or process-global caches. A failed authenticated prefetch does not replace server-side route authorization.

Clear browser data before a full navigation after an identity change, including login, logout and account switching:

```ts
import { authClient } from "@/lib/auth-client";
import { resetQueryCache } from "@/trpc/query-client";

await authClient.signOut();
await resetQueryCache();
window.location.assign("/");
```

The reset cancels in-flight queries before clearing the cache. Apply the same pattern after successful sign-in/sign-up; handle authentication errors before navigating. Existing data should remain visible during ordinary background refresh; use skeletons only for missing dynamic fragments during initial loading, with static UI already visible. Protected calls and role changes are always revalidated on the server regardless of the browser cache.

References: [tRPC App Router setup](https://trpc.io/docs/client/nextjs/app-router-setup), [TanStack Query advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).

## Reusable admin tables

`src/lib/table-query.ts` provides the base Zod schema, allowed page sizes and URL read/write helpers. `users-query.ts` extends it with role and sort whitelists; `routers/users.ts` applies the same validated input to both the row query and count. Each list query must validate its own authorization and return only display fields.

The Users block composes `DataTable`, `DataTableSearch`, `DataTablePagination` and `useDataTableState` in the admin component/hook directories. Extend the schema for another entity and keep its columns/query separate. The hook preserves unrelated URL parameters, clears default values and resets pagination atomically when filters, sorting or page size change. Search uses replace history with a 450 ms debounce; discrete changes use push history. Both synchronize with Back/Forward without a server navigation. The server clamps pages beyond the last available page.

The list uses tRPC query options with an administrator scope appended to the query key, 60-second freshness, five-minute garbage collection, cancellation signals, automatic stale revalidation on mount/window refocus/reconnect and no automatic retries. No eager page prefetch is needed. Returning within freshness reuses the browser cache; stale data refreshes with existing rows visible. After a user mutation, invalidate `trpc.admin.users.pathKey()`; it also matches scoped keys. Clear all caches before identity changes. Initial skeletons cover only table cells and unknown totals, following the requested page size; titles, filters, headers and pagination controls remain visible. Session checks remain request-local and responses are `no-store`; never put these private results in shared Next.js caches.

## Query UI policy

Every new project's `AGENTS.md` summarizes these conventions under **Dinvolt UI** and **Dinvolt tRPC and queries**. Use them as defaults for new screens, adapting them to the feature and the user's requests.

Prefer automatic revalidation over routine Refresh, Reload or Sync controls. Use the shared QueryClient, revalidation of stale data on mount/window refocus/network reconnect, and targeted cache updates or invalidation after mutations. Adapt freshness and retries to the feature. The shared client starts with 30-second freshness; Users uses one minute. Fresh queries are reused without a request. `staleTime` marks data stale; it does not start a polling timer. Add polling when the product needs periodic updates.

Render the static page structure immediately. Before dynamic values are available, show matching skeletons only for those values, such as table cells and unknown totals, following the requested row count. Headings, descriptions, form fields, filters, table headers and known pagination controls must remain outside the loading boundary. A Client Component can prerender too. An empty result is data. During background refreshes, preserve the current rows, counts and sort indicators without skeletons, spinners, loading text, dimming, overlays or controls disabled solely by `isFetching`. Use `placeholderData` / `keepPreviousData` across filter/page changes within the same identity. Keep authorization boundaries and query-cache clearing on identity changes. Errors may expose a contextual Try again action while preserving usable content.

References: [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [window focus refetching](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching).

## Filtered CSV export

The admin block installs `/api/admin/users/export`. `src/trpc/routers/users-data.ts` centralizes the list/export selection, filters, order and cursor predicates. `usersExportQuerySchema` deliberately omits pagination. The export checks the admin session itself, reads batches of 500 and passes rows to `createCsvResponse` from `src/lib/csv.ts`. It does not populate the TanStack query cache or modify users. Share these predicates whenever a new table offers both pagination and complete export. Reuse `DataTableExport` for explicit downloads; preserve safe errors and existing content.
