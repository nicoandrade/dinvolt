import { z } from "zod";

const tablePageSizes = [10, 20, 50, 100] as const;
const tableQuerySchema = z.object({
  page: z.int().min(1).max(100_000).default(1),
  perPage: z
    .union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)])
    .default(10),
  search: z.string().trim().max(100).default(""),
  sortBy: z.string().default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});
type TableQuery = z.infer<typeof tableQuerySchema>;

// Parse each parameter separately so a malformed page doesn't discard valid filters.
const readTableQuery = <T extends TableQuery>(
  schema: z.ZodType<T>,
  params: URLSearchParams
): T => {
  const defaults = schema.parse({});
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = params.get(key);
    if (raw === null) {
      continue;
    }
    const value = key === "page" || key === "perPage" ? Number(raw) : raw;
    const parsed = schema.safeParse({ ...defaults, [key]: value });
    if (parsed.success) {
      result[key] = parsed.data[key];
    }
  }
  return result;
};

const writeTableQuery = <T extends TableQuery>(
  schema: z.ZodType<T>,
  params: URLSearchParams,
  state: T
) => {
  const next = new URLSearchParams(params);
  const defaults = schema.parse({});
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    if (state[key] === defaults[key]) {
      next.delete(key);
    } else {
      next.set(key, String(state[key]));
    }
  }
  return next;
};

export { readTableQuery, tablePageSizes, tableQuerySchema, writeTableQuery };
export type { TableQuery };
