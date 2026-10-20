/* eslint-disable shadcn/no-inline-styles -- ImageResponse requires inline styles and does not load CSS classes. */
import { ImageResponse } from "next/og";

import { LogoIso } from "@/components/logo-iso";

export const createIconImage = (dark: boolean, size: number) =>
  new ImageResponse(
    <div
      style={{
        alignItems: "center",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <LogoIso
        style={{ color: dark ? "#fff" : "#000" }}
        height={size}
        title=""
      />
    </div>,
    {
      headers: {
        "Cache-Control":
          process.env.NODE_ENV === "development"
            ? "no-store"
            : "public, max-age=31536000, immutable",
      },
      height: size,
      width: size,
    }
  );
