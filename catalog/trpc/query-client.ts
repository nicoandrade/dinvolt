import {
  defaultShouldDehydrateQuery,
  isServer,
  QueryClient,
} from "@tanstack/react-query";
import { deserialize, serialize } from "superjson";

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      dehydrate: {
        serializeData: serialize,
        shouldDehydrateQuery: (query) => {
          const isPending = query.state.status === "pending";
          return defaultShouldDehydrateQuery(query) || isPending;
        },
        // Next.js handles its own dynamic-rendering signals and production error redaction.
        shouldRedactErrors: () => false,
      },
      hydrate: { deserializeData: deserialize },
      queries: { staleTime: 30_000 },
    },
  });

const browserCache: { client?: QueryClient } = {};
const getQueryClient = () => {
  if (isServer) {
    return makeQueryClient();
  }
  browserCache.client ??= makeQueryClient();
  return browserCache.client;
};

// Call before a full navigation after login, logout, or an account/role switch.
const resetQueryCache = async () => {
  if (isServer || !browserCache.client) {
    return;
  }
  await browserCache.client.cancelQueries();
  browserCache.client.clear();
};

export { getQueryClient, makeQueryClient, resetQueryCache };
