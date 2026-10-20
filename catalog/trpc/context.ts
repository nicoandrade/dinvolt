import "server-only";
import { getSessionCookie } from "better-auth/cookies";

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
      // Missing cookies need no auth/database initialization. A present cookie
      // still requires Better Auth validation and the procedure's authorization.
      if (!getSessionCookie(headers)) {
        return null;
      }
      return getAuth().api.getSession({ headers });
    })();
    return sessionCache.value;
  };
  return { getDb, getSession };
};

export { createTRPCContext };
export type TRPCContext = ReturnType<typeof createTRPCContext>;
