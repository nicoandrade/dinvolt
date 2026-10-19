import "server-only";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/trpc/init";

import { adminUser, adminUsers } from "./users";

const appRouter = createTRPCRouter({
  admin: createTRPCRouter({
    status: adminProcedure.query(() => ({ authorized: true })),
    user: adminUser,
    users: adminUsers,
  }),
  auth: createTRPCRouter({
    me: protectedProcedure.query(({ ctx }) => ({
      email: ctx.session.user.email,
      id: ctx.session.user.id,
      image: ctx.session.user.image ?? null,
      name: ctx.session.user.name,
      role: ctx.session.user.role ?? "user",
    })),
  }),
  health: publicProcedure.query(() => {
    const timestamp = new Date();
    return { status: "ok", timestamp };
  }),
});

export { appRouter };
export type AppRouter = typeof appRouter;
