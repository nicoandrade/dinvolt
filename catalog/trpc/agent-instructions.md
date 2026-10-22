<!-- BEGIN:dinvolt-trpc -->

## Dinvolt tRPC and queries

When the project uses tRPC and TanStack Query, reuse its current helpers and QueryClient (initially `@/trpc/client` and `@/trpc/server`). Consult `docs/trpc.md` if available and follow the rendering and action conventions in Dinvolt UI.

- Validate inputs and authorize private reads/actions on the server, including resource ownership. Reuse the project's auth integration for auth-management operations; the starter uses Better Auth, documented in `docs/auth.md`.
- Keep the protected panel and its skeletons behind the server `AdminGate`. After authorization, render static controls immediately and suspend only unresolved data. Reuse request-scoped session reads and the hydrated administrator identity; do not add browser session requests to panel components.
- Scope query keys to the resource, parameters and identity. Wait for required identity/URL state before fetching; cancel and clear private queries on identity changes.
- Update or invalidate affected keys after mutations. Prefer automatic stale revalidation over routine refresh buttons; choose freshness, retries and any polling to fit the feature.
- Retain data across refetches and parameter changes within the same identity, using `placeholderData` / `keepPreviousData` where appropriate. Preserve usable content on errors and offer contextual retry.

<!-- END:dinvolt-trpc -->
