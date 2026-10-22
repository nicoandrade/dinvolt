import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const publicAuthPaths = new Set([
  "/admin",
  "/admin/forgot-password",
  "/admin/reset-password",
]);
const publicMetadataPath = "/admin/opengraph-image";

export const proxy = (request: NextRequest) => {
  const pathname = request.nextUrl.pathname.replace(/\/$/u, "") || "/";
  // Sign-in, recovery and the generated social image must remain public.
  if (
    publicAuthPaths.has(pathname) ||
    pathname === publicMetadataPath ||
    pathname.startsWith(`${publicMetadataPath}-`) ||
    pathname.startsWith(`${publicMetadataPath}/`)
  ) {
    return NextResponse.next();
  }
  // Cookie presence only skips the early redirect. AdminGate validates access.
  // Keep this aligned with admin-auth if Better Auth cookie names change.
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/admin/:path*"],
};
