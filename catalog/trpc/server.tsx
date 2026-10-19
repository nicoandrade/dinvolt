/* eslint-disable react-doctor/only-export-components -- These server-only RSC helpers are not a client Fast Refresh boundary. */
import "server-only";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type {
  DefaultError,
  FetchQueryOptions,
  QueryKey,
} from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";
import type { ReactNode } from "react";

import { createTRPCContext } from "./context";
import { makeQueryClient } from "./query-client";
import { appRouter } from "./routers/app";

const getQueryClient = cache(makeQueryClient);
const getContext = cache(() => createTRPCContext({ headers }));
const trpc = createTRPCOptionsProxy({
  ctx: getContext,
  queryClient: getQueryClient,
  router: appRouter,
});
const getCaller = cache(() => appRouter.createCaller(getContext));
// With Cache Components, await connection() inside Suspense before prefetch/hydration.
const prefetch = <
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryOptions: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>
) => getQueryClient().prefetchQuery(queryOptions);

const HydrateClient = ({ children }: { children: ReactNode }) => (
  <HydrationBoundary state={dehydrate(getQueryClient())}>
    {children}
  </HydrationBoundary>
);

export { getCaller, getQueryClient, HydrateClient, prefetch, trpc };
