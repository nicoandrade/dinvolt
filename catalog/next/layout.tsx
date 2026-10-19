import type { Metadata } from "next";
import type { ReactNode } from "react";

import { siteIcons } from "@/lib/icons";

import "./globals.css";

export const metadata: Metadata = {
  description: "Built with Dinvolt.",
  icons: siteIcons,
  title: "Dinvolt",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
