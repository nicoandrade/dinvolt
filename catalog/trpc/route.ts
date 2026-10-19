import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createTRPCContext } from "@/trpc/context";
import { appRouter } from "@/trpc/routers/app";

const handler = async (request: Request) => {
  const url = new URL(request.url);
  if (
    request.method === "POST" &&
    request.headers.get("origin") !== url.origin
  ) {
    return Response.json(
      { error: "Invalid request origin" },
      { headers: { "Cache-Control": "no-store" }, status: 403 }
    );
  }
  const response = await fetchRequestHandler({
    createContext: () => createTRPCContext({ headers: request.headers }),
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
};

export { handler as GET, handler as POST };
