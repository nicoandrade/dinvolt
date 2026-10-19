"use client";

import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";

import { useAdminBreadcrumb } from "@/components/admin-breadcrumb";
import { BackButton } from "@/components/back-button";
import { EditUserSheet } from "@/components/edit-user-sheet";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserRouteSync } from "@/components/user-route-sync";
import { useAdminUser } from "@/hooks/use-admin-user";
import { useTRPC, useTRPCClient } from "@/trpc/client";
import { resetQueryCache } from "@/trpc/query-client";
import type { AppRouter } from "@/trpc/routers/app";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const dateValue = (value: Date | string) => (
  <time dateTime={new Date(value).toISOString()}>
    {dateFormatter.format(new Date(value))}
  </time>
);
type UserDetails = inferRouterOutputs<AppRouter>["admin"]["user"];
const fieldLabels = [
  "Email",
  "Role",
  "Status",
  "Email verified",
  "Created",
  "Updated",
  "User ID",
];
const isUserNotFound = (error: unknown) =>
  error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
const userFields = (
  data: UserDetails
): { label: string; value: ReactNode }[] => {
  const fields: { label: string; value: ReactNode }[] = [
    {
      label: "Email",
      value: (
        <CopyButton aria-label="Copy email" inline value={data.email}>
          {data.email}
        </CopyButton>
      ),
    },
    { label: "Role", value: data.role || "user" },
    { label: "Status", value: data.banned ? "Banned" : "Active" },
    {
      label: "Email verified",
      value: data.emailVerified ? "Verified" : "Unverified",
    },
    { label: "Created", value: dateValue(data.createdAt) },
    { label: "Updated", value: dateValue(data.updatedAt) },
    { label: "User ID", value: data.id },
  ];
  if (data.banned) {
    fields.push(
      { label: "Ban reason", value: data.banReason || "Not specified" },
      {
        label: "Ban expires",
        value: data.banExpires ? dateValue(data.banExpires) : "No expiration",
      }
    );
  }
  return fields;
};

const useUserDetails = (
  userId: string,
  viewerId: string | undefined,
  enabled: boolean
) => {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const options = trpc.admin.user.queryOptions({ id: userId });
  return useQuery({
    ...options,
    enabled: enabled && !!viewerId && !!userId,
    queryKey: [[...options.queryKey[0], viewerId ?? ""], options.queryKey[1]],
    queryFn: async ({ signal }) => {
      try {
        return await client.admin.user.query({ id: userId }, { signal });
      } catch (error) {
        if (
          error instanceof TRPCClientError &&
          ["UNAUTHORIZED", "FORBIDDEN"].includes(error.data?.code)
        ) {
          await resetQueryCache();
          window.location.assign("/admin");
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
};

const AdminUser = ({
  userId: providedUserId,
  viewerId: providedViewerId,
  enabled = true,
  backHref = "/admin/users",
  params,
}: {
  userId?: string;
  viewerId?: string;
  enabled?: boolean;
  backHref?: string;
  params?: Promise<{ userId: string }>;
}) => {
  const [routeUserId, setRouteUserId] = useState("");
  const identity = useAdminUser();
  const userId = providedUserId ?? routeUserId;
  const query = useUserDetails(
    userId,
    providedViewerId ?? identity?.id,
    enabled
  );
  const { data } = query;
  const missing = isUserNotFound(query.error);
  const pending = !data && query.isPending;
  let title = data?.name;
  if (data === undefined && query.isError) {
    title = missing ? "User not found" : "User";
  }
  useAdminBreadcrumb({
    path: userId ? `/admin/users/${encodeURIComponent(userId)}` : "",
    title,
    parentHref: backHref,
    identityId: identity?.id,
  });
  const fields = data
    ? userFields(data)
    : fieldLabels.map((label) => ({ label, value: "—" }));
  return (
    <section
      aria-labelledby="user-title"
      className="flex min-w-0 flex-col gap-6"
    >
      {params ? (
        <Suspense fallback={null}>
          <UserRouteSync params={params} onChange={setRouteUserId} />
        </Suspense>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        <BackButton href={backHref}>Users</BackButton>
        <PageHeader
          title={title ?? <Skeleton className="h-8 w-48 max-w-full" />}
          titleId="user-title"
          actions={<EditUserSheet user={data} />}
        />
      </div>
      {query.isError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-muted-foreground text-sm">
            {missing
              ? "This user does not exist or has been deleted."
              : "Unable to fetch the user. Please try again."}
          </p>
          {missing ? null : (
            <Button
              onClick={() => {
                void query.refetch();
              }}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          )}
        </div>
      ) : null}
      <div aria-busy={pending} className="flex min-w-0 flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Key fields
        </h2>
        <dl className="grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm sm:max-w-2xl">
          {fields.map((field) => (
            <div className="contents" key={field.label}>
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 font-medium wrap-anywhere">
                {pending ? (
                  <Skeleton
                    className={
                      field.label === "Email" || field.label === "User ID"
                        ? "h-5 w-48 max-w-full"
                        : "h-5 w-24 max-w-full"
                    }
                  />
                ) : (
                  field.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};

export { AdminUser };
