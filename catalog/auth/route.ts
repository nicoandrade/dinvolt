import { getSessionCookie } from "better-auth/cookies";
import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

// eslint-disable-next-line unicorn/no-top-level-side-effects -- Creates lazy handlers without initializing auth or the database.
const handlers = toNextJsHandler((request) => getAuth().handler(request));

const GET = (request: Request) => {
  // The public login checks in the background. Anonymous visitors need neither
  // database initialization nor a remote read; a cookie still requires validation.
  if (
    new URL(request.url).pathname === "/api/auth/get-session" &&
    !getSessionCookie(request)
  ) {
    return Response.json(null, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return handlers.GET(request);
};

const { POST } = handlers;

export { GET, POST };
