import { siteConfig } from "@/config/site";
import { createOpenGraphImage } from "@/lib/og-image";

export const alt = siteConfig.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return createOpenGraphImage(alt);
}
