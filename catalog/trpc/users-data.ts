import "server-only";
import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

import { user } from "@/db/auth-schema";
import type { UsersExportQuery } from "@/lib/users-query";

const usersSelection = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  banned: user.banned,
  createdAt: user.createdAt,
};
type UserCursor = Pick<
  typeof user.$inferSelect,
  "id" | "name" | "email" | "createdAt"
>;

const containsText = (column: SQLWrapper, value: string) => {
  const pattern = `%${value.toLowerCase().replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_")}%`;
  return sql`lower(${column}) like ${pattern} escape '!'`;
};

// List and export must share exactly the same predicates and deterministic order.
const usersWhere = (input: UsersExportQuery) =>
  and(
    input.search
      ? or(
          containsText(user.name, input.search),
          containsText(user.email, input.search),
          containsText(user.id, input.search)
        )
      : undefined,
    input.role === "all"
      ? undefined
      : sql`(',' || replace(coalesce(nullif(${user.role}, ''), 'user'), ' ', '') || ',') like ${`%,${input.role},%`}`
  );
const usersOrder = (input: UsersExportQuery) => [
  (input.sortDirection === "asc" ? asc : desc)(user[input.sortBy]),
  asc(user.id),
];
const usersAfter = (input: UsersExportQuery, after: UserCursor) => {
  const column = user[input.sortBy];
  const value = after[input.sortBy];
  return or(
    (input.sortDirection === "asc" ? gt : lt)(column, value),
    and(eq(column, value), gt(user.id, after.id))
  );
};

export { usersAfter, usersOrder, usersSelection, usersWhere };
export type { UserCursor };
