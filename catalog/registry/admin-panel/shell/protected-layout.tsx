import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { adminIdentityQueryKey } from "@/lib/admin-identity";
import { makeQueryClient } from "@/trpc/query-client";

const AdminGate = async ({ children }: { children: ReactNode }) => {
  const user = await requireAdmin();
  const queryClient = makeQueryClient();
  queryClient.setQueryData(adminIdentityQueryKey, user);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminShell user={user}>{children}</AdminShell>
    </HydrationBoundary>
  );
};

// Session redirects can prevent Next.js instant-navigation validation from rendering its target.
// This opts out of validation feedback only; Cache Components and streaming remain enabled.
export const instant = false;

const ProtectedLayout = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={null}>
    <AdminGate>{children}</AdminGate>
  </Suspense>
);

export default ProtectedLayout;
