import "server-only";
import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { getAuth } from "@/lib/auth";
import type { Session } from "@/lib/auth";

// React cache deduplicates this read only within the current server request.
const getAdminSession = cache(async () => {
  const requestHeaders = await headers();
  // Absence is an optimization; a cookie's presence never grants access.
  // Keep this helper aligned if Better Auth's cookie name/prefix is customized.
  if (!getSessionCookie(requestHeaders)) {
    return null;
  }
  await connection();
  try {
    const session = await getAuth().api.getSession({ headers: requestHeaders });
    return session?.user.banned ? null : session;
  } catch {
    // Do not expose provider exceptions or their attached query parameters.
    throw new Error("Unable to verify access. Please try again.");
  }
});

const isAdmin = (session: Session | null) =>
  session?.user.role?.split(",").some((role) => role.trim() === "admin") ??
  false;

// Call at each protected data/action boundary as well as the visual layout.
const requireAdmin = async () => {
  const session = await getAdminSession();
  if (!(session && isAdmin(session))) {
    redirect("/admin");
  }
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
};

export { getAdminSession, isAdmin, requireAdmin };
