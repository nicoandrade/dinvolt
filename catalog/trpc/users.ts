import "server-only";
import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { user } from "@/db/auth-schema";
import { usersQuerySchema } from "@/lib/users-query";
import { adminProcedure } from "@/trpc/init";

import { usersOrder, usersSelection, usersWhere } from "./users-data";

const adminUsers = adminProcedure
  .input(usersQuerySchema)
  .query(async ({ ctx, input }) => {
    const db = ctx.getDb();
    const where = usersWhere(input);
    const [{ total }] = await db
      .select({ total: count() })
      .from(user)
      .where(where);
    const page = Math.min(
      input.page,
      Math.max(1, Math.ceil(total / input.perPage))
    );
    const users = await db
      .select(usersSelection)
      .from(user)
      .where(where)
      .orderBy(...usersOrder(input))
      .limit(input.perPage)
      .offset((page - 1) * input.perPage);
    return { ...input, page, total, users };
  });

const adminUser = adminProcedure
  .input(z.object({ id: z.string().min(1).max(256) }))
  .query(async ({ ctx, input }) => {
    const [result] = await ctx
      .getDb()
      .select({
        ...usersSelection,
        updatedAt: user.updatedAt,
        banReason: user.banReason,
        banExpires: user.banExpires,
      })
      .from(user)
      .where(eq(user.id, input.id))
      .limit(1);
    if (!result) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    }
    return result;
  });

export { adminUser, adminUsers };
