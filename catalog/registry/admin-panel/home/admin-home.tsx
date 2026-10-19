"use client";

import { PageHeader } from "@/components/page-header";
import { useAdminUser } from "@/hooks/use-admin-user";

const AdminHome = ({ name }: { name?: string }) => {
  const user = useAdminUser();
  const displayName = name ?? user?.name;
  return (
    <section aria-labelledby="home-title" className="flex flex-col gap-2">
      <PageHeader
        title="Home"
        titleId="home-title"
        description={
          <>
            Welcome back,{" "}
            {displayName === undefined ? (
              <span
                aria-hidden="true"
                data-slot="skeleton"
                className="bg-muted inline-block h-5 w-28 animate-pulse rounded-md align-middle"
              />
            ) : (
              displayName
            )}
            .
          </>
        }
      />
    </section>
  );
};

export { AdminHome };
