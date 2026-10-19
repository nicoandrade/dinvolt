import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";

import type { getDb } from "@/db";
import { schema } from "@/db/schema";

import { authLogger } from "./auth-logger";
import { getAuthOrigin } from "./auth-origin";

// Shared by the server-only application entry point and the trusted CLI configuration.
const createAuth = (
  database: ReturnType<typeof getDb>,
  runInBackground?: (task: Promise<unknown>) => void
) => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Set BETTER_AUTH_SECRET to a random secret of at least 32 characters in .env.local."
    );
  }
  const origin = getAuthOrigin();
  return betterAuth({
    baseURL: origin,
    trustedOrigins: origin ? [origin] : [],
    database: drizzleAdapter(database, {
      provider: "__PROVIDER__",
      schema,
      transaction: __TRANSACTIONS__,
    }),
    advanced: {
      backgroundTasks: runInBackground
        ? { handler: runInBackground }
        : undefined,
    },
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const { sendPasswordResetEmail } = await import("./email");
        await sendPasswordResetEmail({ to: user.email, url });
      },
    },
    logger: authLogger,
    plugins: [admin(), nextCookies()],
    secret,
  });
};

export { createAuth };
