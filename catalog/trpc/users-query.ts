import { z } from "zod";

import { tableQuerySchema } from "./table-query";

const usersQuerySchema = tableQuerySchema.extend({
  role: z.enum(["all", "admin", "user"]).default("all"),
  sortBy: z.enum(["name", "email", "createdAt"]).default("createdAt"),
});
const usersExportQuerySchema = usersQuerySchema.omit({
  page: true,
  perPage: true,
});

export { usersExportQuerySchema, usersQuerySchema };
export type UsersExportQuery = z.infer<typeof usersExportQuerySchema>;
export type UsersQuery = z.infer<typeof usersQuerySchema>;
