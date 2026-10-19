"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { adminIdentityQueryKey } from "@/lib/admin-identity";
import type { AdminIdentity } from "@/lib/admin-identity";

// Hydrated by the server after requireAdmin; never starts a browser session fetch.
// Identity changes clear this alongside the existing per-administrator query cache.
const subscribe = () => () => {
  // useQuery owns the subscription; this store only coordinates hydration.
};
const serverIdentity = (): undefined => {
  // Static HTML never contains the protected layout's streamed identity.
};
const useAdminUser = () => {
  const { data } = useQuery<AdminIdentity>({
    queryKey: adminIdentityQueryKey,
    queryFn: skipToken,
    staleTime: Infinity,
  });
  // The streamed identity can enter the browser cache before sibling static HTML
  // hydrates. Match its empty server snapshot first, then expose verified data.
  return useSyncExternalStore(subscribe, () => data, serverIdentity);
};

export { useAdminUser };
