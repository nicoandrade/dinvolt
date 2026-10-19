"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminBreadcrumbEntry {
  path: string;
  title?: string;
  parentHref: string;
  identityId?: string;
}

const AdminBreadcrumbContext = createContext<Dispatch<
  SetStateAction<AdminBreadcrumbEntry | null>
> | null>(null);
const AdminBreadcrumbEntryContext = createContext<AdminBreadcrumbEntry | null>(
  null
);

const AdminBreadcrumbProvider = ({ children }: { children: ReactNode }) => {
  const [entry, setEntry] = useState<AdminBreadcrumbEntry | null>(null);
  return (
    <AdminBreadcrumbContext value={setEntry}>
      <AdminBreadcrumbEntryContext value={entry}>
        {children}
      </AdminBreadcrumbEntryContext>
    </AdminBreadcrumbContext>
  );
};

// Publish an already authorized page result; this hook never fetches data.
const useAdminBreadcrumb = ({
  path,
  title,
  parentHref,
  identityId,
}: AdminBreadcrumbEntry) => {
  const setBreadcrumb = useContext(AdminBreadcrumbContext);
  useEffect(() => {
    if (!setBreadcrumb || !path) {
      return;
    }
    const entry = { path, title, parentHref, identityId };
    setBreadcrumb(entry);
    return () =>
      setBreadcrumb((current) => (current === entry ? null : current));
  }, [setBreadcrumb, path, title, parentHref, identityId]);
};

const AdminBreadcrumb = ({
  path,
  sectionTitle,
  identityId,
  parentHref = "/admin/users",
}: {
  path: string;
  sectionTitle: string;
  identityId?: string;
  parentHref?: string;
}) => {
  const registered = useContext(AdminBreadcrumbEntryContext);
  const entry =
    registered?.path === path && registered.identityId === identityId
      ? registered
      : undefined;
  const detail = path.startsWith("/admin/users/") || !!entry;
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden shrink-0 md:block">
          Admin Panel
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden shrink-0 md:block" />
        <BreadcrumbItem className="shrink-0">
          {detail ? (
            <BreadcrumbLink
              render={<Link href={entry?.parentHref ?? parentHref} />}
            >
              {sectionTitle}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>{sectionTitle}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {detail ? (
          <>
            <BreadcrumbSeparator className="shrink-0" />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage
                aria-label={entry?.title ? undefined : "User"}
                className="min-w-0"
              >
                <span className="block truncate">
                  {entry?.title ?? (
                    <Skeleton
                      aria-hidden="true"
                      className="h-4 w-28 max-w-full"
                    />
                  )}
                </span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export { AdminBreadcrumb, AdminBreadcrumbProvider, useAdminBreadcrumb };
export type { AdminBreadcrumbEntry };
