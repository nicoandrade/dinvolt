import { expect, test } from "bun:test";

import {
  readTableQuery,
  writeTableQuery,
} from "../catalog/trpc/table-query.ts";
import { usersQuerySchema } from "../catalog/trpc/users-query.ts";

test("table URLs retain valid filters when individual parameters are malformed", () => {
  const state = readTableQuery(
    usersQuerySchema,
    new URLSearchParams(
      "search=Alex&role=admin&page=-2&perPage=999&sortBy=password&sortDirection=asc"
    )
  );
  expect(state).toEqual({
    search: "Alex",
    role: "admin",
    page: 1,
    perPage: 10,
    sortBy: "createdAt",
    sortDirection: "asc",
  });
  expect(
    readTableQuery(
      usersQuerySchema,
      new URLSearchParams("page=1.5&role=superadmin")
    ).role
  ).toBe("all");
  expect(usersQuerySchema.safeParse({ role: "superadmin" }).success).toBe(
    false
  );
  expect(usersQuerySchema.safeParse({ page: 100_001 }).success).toBe(false);
  expect(usersQuerySchema.safeParse({ search: "x".repeat(101) }).success).toBe(
    false
  );
});

test("table URL serialization removes defaults and preserves unrelated parameters", () => {
  const state = usersQuerySchema.parse({
    search: "  a+b%_!@example.com  ",
    role: "admin",
    page: 3,
    perPage: 20,
    sortBy: "email",
    sortDirection: "asc",
  });
  const params = writeTableQuery(
    usersQuerySchema,
    new URLSearchParams("theme=dark&search=old"),
    state
  );
  expect(readTableQuery(usersQuerySchema, params)).toEqual(state);
  expect(params.get("theme")).toBe("dark");
  const cleared = writeTableQuery(
    usersQuerySchema,
    params,
    usersQuerySchema.parse({})
  );
  expect(cleared.toString()).toBe("theme=dark");
});
