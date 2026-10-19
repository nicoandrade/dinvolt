import "server-only";
import { getDatabaseEnvironment } from "@/db/environment";

// Read only after the production guard. Never use NEXT_PUBLIC or next.config env.
export const developmentAdminDefaults = () => {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL === "1"
  ) {
    return { email: "", password: "" };
  }
  try {
    if (getDatabaseEnvironment() !== "development") {
      return { email: "", password: "" };
    }
  } catch {
    // A pending/invalid DB configuration must not block the static login form.
    return { email: "", password: "" };
  }
  return {
    email: process.env.DEV_ADMIN_USER ?? "",
    password: process.env.DEV_ADMIN_PASSWORD ?? "",
  };
};
