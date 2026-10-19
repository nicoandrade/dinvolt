import type { Metadata } from "next";

export const siteIcons: Metadata["icons"] = {
  apple: [
    {
      media: "(prefers-color-scheme: light)",
      sizes: "180x180",
      type: "image/png",
      url: "/icons/apple-light.png",
    },
    {
      media: "(prefers-color-scheme: dark)",
      sizes: "180x180",
      type: "image/png",
      url: "/icons/apple-dark.png",
    },
  ],
  icon: [
    {
      media: "(prefers-color-scheme: light)",
      sizes: "32x32",
      type: "image/png",
      url: "/icons/light.png",
    },
    {
      media: "(prefers-color-scheme: dark)",
      sizes: "32x32",
      type: "image/png",
      url: "/icons/dark.png",
    },
  ],
};
