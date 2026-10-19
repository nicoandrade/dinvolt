import "server-only";
import { getDb } from "@/db";
import { getAuth } from "@/lib/auth";
import type { Session } from "@/lib/auth";

const createTRPCContext = (options: {
  headers: Headers | (() => Promise<Headers>);
}) => {
  const sessionCache: { value?: Promise<Session | null> } = {};
  const getSession = () => {
    sessionCache.value ??= (async () => {
      const headers =
        typeof options.headers === "function"
          ? await options.headers()
          : options.headers;
      return getAuth().api.getSession({ headers });
    })();
    return sessionCache.value;
  };
  return { getDb, getSession };
};

export { createTRPCContext };
export type TRPCContext = ReturnType<typeof createTRPCContext>;
