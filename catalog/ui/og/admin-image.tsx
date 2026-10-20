import { siteConfig } from "@/config/site";
import { createOpenGraphImage, getOpenGraphImageVersion } from "@/lib/og-image";

export const alt = `Admin Panel | ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const generateImageMetadata = () => [
  { alt, contentType, id: getOpenGraphImageVersion(alt), size },
];

export default function Image() {
  return createOpenGraphImage(alt);
}
