import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import { SuperJSON } from "superjson";
import { flattenError, ZodError } from "zod";

import type { TRPCContext } from "./context";

const trpc = initTRPC.context<TRPCContext>().create({
  errorFormatter: ({ error, shape }) => {
    const { code, httpStatus, path } = shape.data;
    return {
      ...shape,
      data: {
        code,
        httpStatus,
        path,
        zodError:
          error.cause instanceof ZodError ? flattenError(error.cause) : null,
      },
      message:
        error.code === "INTERNAL_SERVER_ERROR"
          ? "Internal server error"
          : shape.message,
    };
  },
  transformer: SuperJSON,
});

const {
  createCallerFactory,
  procedure: publicProcedure,
  router: createTRPCRouter,
} = trpc;
const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const session = await ctx.getSession();
  if (!session || session.user.banned) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session } });
});
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const isAdmin = ctx.session.user.role
    ?.split(",")
    .some((role) => role.trim() === "admin");
  if (!isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { session: ctx.session } });
});

export {
  adminProcedure,
  createCallerFactory,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
};
