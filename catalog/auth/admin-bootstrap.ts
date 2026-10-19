import { sql } from "drizzle-orm";

import { auth } from "../auth.config";
import { getDb } from "../src/db/connection";
import { getDatabaseEnvironment } from "../src/db/environment";
import { account, session, user, verification } from "../src/db/schema";

// Trusted local tooling only. Select explicit columns without reading user records.
const checkDatabase = async () => {
  const db = getDb();
  for (const table of [user, account, session, verification]) {
    // eslint-disable-next-line no-await-in-loop -- Turso shares an HTTP stream; inspect schema sequentially before any writes.
    await db.select().from(table).limit(0);
  }
};

const hasAdministrator = async () => {
  const rows = await getDb()
    .select({ role: user.role })
    .from(user)
    .where(sql`${user.role} LIKE ${"%admin%"}`);
  return rows.some(({ role }) =>
    role?.split(",").some((entry) => entry.trim() === "admin")
  );
};

export const bootstrap = {
  auth,
  checkDatabase,
  getDatabaseEnvironment,
  hasAdministrator,
};
