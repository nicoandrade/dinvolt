import { notFound } from "next/navigation";
import { Suspense } from "react";

import { examples } from "@/playground/examples";
import { Preview } from "@/playground/preview";

export const instant = false;

async function PreviewContent({
  params,
  searchParams,
}: {
  params: Promise<{ example: string }>;
  searchParams: Promise<{ scenario?: string; theme?: string; userId?: string }>;
}) {
  const { example } = await params;
  const { scenario = "default", theme, userId } = await searchParams;
  const entry = examples.find((item) => item.id === example);
  if (
    !entry ||
    !entry.scenarios.some((item) => item.id === scenario && item.id !== "live")
  ) {
    notFound();
  }
  return (
    <Preview
      dark={theme === "dark"}
      example={example}
      scenario={scenario}
      userId={userId}
    />
  );
}

export default function PreviewPage(
  props: Parameters<typeof PreviewContent>[0]
) {
  return (
    <Suspense fallback={null}>
      <PreviewContent {...props} />
    </Suspense>
  );
}
