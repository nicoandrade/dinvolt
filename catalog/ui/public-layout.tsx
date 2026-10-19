import type { Metadata } from "next";
import type { ReactNode } from "react";

import { siteConfig } from "@/config/site";
import { siteIcons } from "@/lib/icons";

import "@/app/globals.css";

export const metadata: Metadata = {
  applicationName: siteConfig.name,
  description: siteConfig.description,
  icons: siteIcons,
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  openGraph: {
    description: siteConfig.description,
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: siteConfig.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description: siteConfig.description,
    title: siteConfig.name,
  },
};

const PublicLayout = ({ children }: { children: ReactNode }) => (
  <html data-ui="public" lang={siteConfig.language}>
    <body>{children}</body>
  </html>
);

export default PublicLayout;
