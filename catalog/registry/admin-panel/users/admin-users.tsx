"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import dynamic from "next/dynamic";

import { usersColumns } from "@/components/admin-users-columns";
import { CreateUserSheet } from "@/components/create-user-sheet";
import { DataTable } from "@/components/data-table";
import { DataTableExport } from "@/components/data-table-export";
import { DataTablePagination } from "@/components/data-table-pagination";
import { DataTableSearch } from "@/components/data-table-search";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminUser } from "@/hooks/use-admin-user";
import { useDataTableState } from "@/hooks/use-data-table-state";
import { usersExportQuerySchema, usersQuerySchema } from "@/lib/users-query";
import { useTRPC, useTRPCClient } from "@/trpc/client";
import { resetQueryCache } from "@/trpc/query-client";

// URL observation has no server-rendered UI. Keep its runtime-only Next hook
// in the browser so it never suspends the static controls or their headers.
const DataTableStateSync = dynamic(
  async () => {
    const observer = await import("@/hooks/use-data-table-state");
    return observer.DataTableStateSync;
  },
  { ssr: false }
);

const emptyUsers: never[] = [];
const defaultUserHref = (id: string) =>
  `/admin/users/${encodeURIComponent(id)}`;
const sortableColumns = ["name", "email", "createdAt"] as const;
const roleOptions = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

const AdminUsers = ({
  viewerId: providedViewerId,
  enabled = true,
  userHref = defaultUserHref,
}: {
  viewerId?: string;
  enabled?: boolean;
  userHref?: (id: string) => string;
}) => {
  const user = useAdminUser();
  const viewerId = providedViewerId ?? user?.id;
  const { state, update, ready } = useDataTableState(usersQuerySchema);
  const client = useTRPCClient();
  const trpc = useTRPC();
  const options = trpc.admin.users.queryOptions(state);
  const query = useQuery({
    ...options,
    enabled: enabled && ready && !!viewerId,
    gcTime: 5 * 60_000,
    placeholderData: (previous, previousQuery) => {
      const scope = previousQuery?.queryKey[0] as string[] | undefined;
      return viewerId && scope?.at(-1) === viewerId
        ? keepPreviousData(previous)
        : undefined;
    },
    queryFn: async ({ signal }) => {
      try {
        return await client.admin.users.query(state, { signal });
      } catch (error) {
        if (
          error instanceof TRPCClientError &&
          ["UNAUTHORIZED", "FORBIDDEN"].includes(error.data?.code)
        ) {
          await resetQueryCache();
          window.location.assign("/admin");
        }
        throw new Error("Unable to fetch users. Please try again.", {
          cause: error,
        });
      }
    },
    queryKey: [[...options.queryKey[0], viewerId ?? ""], options.queryKey[1]],
    retry: false,
    staleTime: 60_000,
  });
  const { data } = query;
  const exportParams = new URLSearchParams(usersExportQuerySchema.parse(state));
  const initialLoading = data === undefined && query.isPending;
  const displayed = data ?? { ...state, total: 0, users: emptyUsers };
  const changeSort = (field: string) => {
    const sortBy = usersQuerySchema.shape.sortBy.safeParse(field);
    if (sortBy.success) {
      update({
        sortBy: sortBy.data,
        sortDirection:
          state.sortBy === field && state.sortDirection === "asc"
            ? "desc"
            : "asc",
      });
    }
  };
  return (
    <section
      aria-labelledby="users-title"
      className="flex min-w-0 flex-col gap-6"
    >
      <DataTableStateSync />
      <PageHeader
        actions={<CreateUserSheet />}
        description="View and manage the users in your application."
        title="Users"
        titleId="users-title"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[minmax(0,20rem)_auto_1fr]">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <DataTableSearch
              label="Search users"
              placeholder="Search by name, email or ID…"
              value={state.search}
              onCommit={(search) => update({ search }, "replace")}
            />
          </div>
          <Select
            items={roleOptions}
            onValueChange={(value) => {
              const role = usersQuerySchema.shape.role.safeParse(value);
              if (role.success) {
                update({ role: role.data });
              }
            }}
            value={state.role}
          >
            <SelectTrigger aria-label="Filter by role" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <DataTableExport
            disabled={!enabled || !ready || !viewerId}
            href={`/api/admin/users/export?${exportParams}`}
            filename="users.csv"
          />
        </div>
        {query.isError ? (
          <div className="flex flex-wrap items-center gap-3" role="alert">
            <p className="text-destructive text-sm">
              Unable to fetch users. Please try again.
            </p>
            <Button
              onClick={() => {
                void query.refetch();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : null}
        <DataTable
          columns={usersColumns}
          data={displayed.users}
          getRowId={(row) => row.id}
          getRowHref={(row) => userHref(row.id)}
          label="Users"
          sortBy={displayed.sortBy}
          sortDirection={displayed.sortDirection}
          sortableColumns={sortableColumns}
          onSortChange={changeSort}
          isFetching={initialLoading || query.isFetching}
          loadingRowCount={initialLoading ? state.perPage : undefined}
          empty={query.isError ? "Users are unavailable." : "No users found."}
        />
        <DataTablePagination
          page={displayed.page}
          perPage={displayed.perPage}
          selectedPerPage={state.perPage}
          total={displayed.total}
          count={displayed.users.length}
          hasData={!!data}
          loading={initialLoading}
          disabled={query.isPending || query.isPlaceholderData || query.isError}
          label="users"
          onPageChange={(page) => update({ page })}
          onPerPageChange={(value) => {
            const perPage = usersQuerySchema.shape.perPage.safeParse(value);
            if (perPage.success) {
              update({ perPage: perPage.data });
            }
          }}
        />
      </div>
    </section>
  );
};

export { AdminUsers };
