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
    default: `Admin Panel | ${siteConfig.name}`,
    template: `%s | ${siteConfig.name}`,
  },
  robots: { follow: false, index: false },
};

const AdminLayout = ({ children }: { children: ReactNode }) => (
  <html className="admin-panel" data-ui="admin" lang="en">
    <body>{children}</body>
  </html>
);

export default AdminLayout;
