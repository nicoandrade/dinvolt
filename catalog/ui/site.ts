// Public information only: this module can be imported by client components.
const preview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
const previewHostname = process.env.NEXT_PUBLIC_VERCEL_URL;
if (
  preview &&
  (!previewHostname ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(previewHostname) ||
    !previewHostname.includes("."))
) {
  throw new Error(
    "Preview requires its assigned NEXT_PUBLIC_VERCEL_URL. Enable Vercel system environment variables."
  );
}

export const siteConfig = {
  name: __PROJECT_NAME__,
  description: "Built with Dinvolt.",
  url: preview
    ? `https://${previewHostname}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? __DEVELOPMENT_URL__),
  language: "en",
  locale: "en_US",
} as const;
