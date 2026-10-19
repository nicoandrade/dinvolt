// Vercel supplies this hostname for this exact deployment. Never derive auth's
// trusted origin from Host/X-Forwarded-Host or trust all *.vercel.app domains.
export const getAuthOrigin = () => {
  if (process.env.VERCEL_ENV === "preview") {
    const hostname = process.env.VERCEL_URL;
    if (
      !hostname ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(hostname) ||
      !hostname.includes(".")
    ) {
      throw new Error(
        "Vercel Preview requires its assigned VERCEL_URL. Enable system environment variables in the project settings."
      );
    }
    return `https://${hostname}`;
  }
  if (process.env.VERCEL_ENV === "production" && !process.env.BETTER_AUTH_URL) {
    throw new Error("Set BETTER_AUTH_URL to the assigned production origin.");
  }
  return process.env.BETTER_AUTH_URL;
};
