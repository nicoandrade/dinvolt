import { and } from "drizzle-orm";

import { getDb } from "@/db";
import { user } from "@/db/auth-schema";
import { getAdminSession, isAdmin } from "@/lib/admin-auth";
import { createCsvResponse } from "@/lib/csv";
import { usersExportQuerySchema } from "@/lib/users-query";
import {
  usersAfter,
  usersOrder,
  usersSelection,
  usersWhere,
} from "@/trpc/routers/users-data";
import type { UserCursor } from "@/trpc/routers/users-data";

const batchSize = 500;
const failure = (status: number) =>
  Response.json(
    { error: "Unable to export users. Please try again." },
    { headers: { "Cache-Control": "private, no-store" }, status }
  );

const GET = async (request: Request) => {
  try {
    const session = await getAdminSession();
    if (!session) {
      return failure(401);
    }
    if (!isAdmin(session)) {
      return failure(403);
    }
    const parsed = usersExportQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return failure(400);
    }
    const input = parsed.data;
    const db = getDb();
    const readBatch = (after?: UserCursor) =>
      db
        .select(usersSelection)
        .from(user)
        .where(
          and(usersWhere(input), after ? usersAfter(input, after) : undefined)
        )
        .orderBy(...usersOrder(input))
        .limit(batchSize);
    // Fail before committing a download if the initial DB read fails.
    const firstBatch = await readBatch();
    const rows = async function* rows() {
      yield [
        "ID",
        "Name",
        "Email",
        "Role",
        "Email verified",
        "Status",
        "Created at",
      ];
      let batch = firstBatch;
      while (batch.length) {
        for (const entry of batch) {
          if (request.signal.aborted) {
            return;
          }
          yield [
            entry.id,
            entry.name,
            entry.email,
            entry.role || "user",
            entry.emailVerified ? "Verified" : "Unverified",
            entry.banned ? "Banned" : "Active",
            entry.createdAt.toISOString(),
          ];
        }
        if (batch.length < batchSize || request.signal.aborted) {
          return;
        }
        const last = batch.at(-1);
        if (!last) {
          return;
        }
        // eslint-disable-next-line no-await-in-loop -- Each cursor depends on the previous batch; keep streaming reads bounded.
        batch = await readBatch(last);
      }
    };
    return createCsvResponse(
      rows(),
      `users-${new Date().toISOString().slice(0, 10)}.csv`
    );
  } catch {
    return failure(500);
  }
};

export { GET };
