import type { Metadata } from "next";

export const iconVersion = process.env.DINVOLT_ICON_VERSION;

export const siteIcons: Metadata["icons"] = {
  apple: [
    {
      media: "(prefers-color-scheme: light)",
      sizes: "180x180",
      type: "image/png",
      url: `/icons/${iconVersion}-apple-light.png`,
    },
    {
      media: "(prefers-color-scheme: dark)",
      sizes: "180x180",
      type: "image/png",
      url: `/icons/${iconVersion}-apple-dark.png`,
    },
  ],
  icon: [
    {
      media: "(prefers-color-scheme: light)",
      sizes: "32x32",
      type: "image/png",
      url: `/icons/${iconVersion}-light.png`,
    },
    {
      media: "(prefers-color-scheme: dark)",
      sizes: "32x32",
      type: "image/png",
      url: `/icons/${iconVersion}-dark.png`,
    },
  ],
};
