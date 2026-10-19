import type { Metadata } from "next";
import type { ReactNode } from "react";

import { siteIcons } from "@/lib/icons";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Dinvolt Playground",
  description: "Internal Dinvolt component and page previews.",
  icons: siteIcons,
};

export default function PlaygroundLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
