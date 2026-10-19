"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { SuperJSON } from "superjson";

import { getQueryClient } from "./query-client";
import type { AppRouter } from "./routers/app";

const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

const TRPCReactProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = getQueryClient();
  // eslint-disable-next-line react/hook-use-state -- The tRPC client is stable for this provider and never replaced.
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ transformer: SuperJSON, url: "/api/trpc" })],
    })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
};

export { TRPCReactProvider, useTRPC, useTRPCClient };
