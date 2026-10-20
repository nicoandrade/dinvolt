import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { NextConfig } from "next";

// Version icon URLs when their self-contained SVG or renderer changes.
const iconVersion = createHash("sha256")
  .update(readFileSync(new URL("src/components/logo-iso.tsx", import.meta.url)))
  .update(readFileSync(new URL("src/lib/icon-image.tsx", import.meta.url)))
  .digest("hex")
  .slice(0, 16);

// Titles are added by generateImageMetadata; these are its shared image inputs.
const openGraphVersion = createHash("sha256")
  .update(readFileSync(new URL("src/components/logo-iso.tsx", import.meta.url)))
  .update(readFileSync(new URL("src/lib/og-image.tsx", import.meta.url)))
  .update(readFileSync(new URL("assets/og/Inter-Bold.ttf", import.meta.url)))
  .digest("hex")
  .slice(0, 16);

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    DINVOLT_ICON_VERSION: iconVersion,
    DINVOLT_OG_VERSION: openGraphVersion,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        as: "*.css",
        loaders: ["@tailwindcss/turbopack"],
      },
    },
  },
};

export default nextConfig;
