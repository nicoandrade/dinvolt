import { notFound } from "next/navigation";

import { createIconImage } from "@/lib/icon-image";
import { iconVersion } from "@/lib/icons";

const variants = [
  "light.png",
  "dark.png",
  "apple-light.png",
  "apple-dark.png",
].map((variant) => `${iconVersion}-${variant}`);

export const generateStaticParams = () =>
  variants.map((variant) => ({ variant }));

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ variant: string }> }
) => {
  const { variant } = await params;
  if (!variants.includes(variant)) {
    notFound();
  }
  return createIconImage(
    variant.endsWith("dark.png"),
    variant.includes("-apple-") ? 180 : 32
  );
};
