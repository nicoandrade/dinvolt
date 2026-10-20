/* eslint-disable shadcn/no-inline-styles -- ImageResponse requires inline styles and does not load CSS classes. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { LogoIso } from "@/components/logo-iso";

const font = readFile(path.join(process.cwd(), "assets/og/Inter-Bold.ttf"));

export const getOpenGraphImageVersion = (title: string) =>
  createHash("sha256")
    .update(`${process.env.DINVOLT_OG_VERSION}:${title}`)
    .digest("hex")
    .slice(0, 16);

export const createOpenGraphImage = async (title: string) => {
  const fontData = await font;

  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background: "#000",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter",
        fontWeight: 700,
        height: "100%",
        justifyContent: "space-between",
        overflow: "hidden",
        padding: 90,
        width: "100%",
      }}
    >
      <LogoIso style={{ color: "#fff" }} height={150} title="" />
      <div
        style={{
          display: "flex",
          fontSize: Math.min(90, Math.max(24, Math.floor(2700 / title.length))),
          lineHeight: 1.2,
          maxWidth: "100%",
          wordBreak: "break-all",
        }}
      >
        {title}
      </div>
    </div>,
    {
      fonts: [{ data: fontData, name: "Inter", style: "normal", weight: 700 }],
      headers: {
        "Cache-Control":
          process.env.NODE_ENV === "development"
            ? "no-store"
            : "public, max-age=31536000, immutable",
      },
      height: 630,
      width: 1200,
    }
  );
};
