import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CatalogPreview as AdminPreview } from "./catalog-admin";
import { catalogItems } from "./catalog-items";
import { CatalogPreview as PublicPreview } from "./catalog-public";
import { publicExamples } from "./examples";
import { PublicActionPreview } from "./public-action-preview";

export interface CatalogPageProps {
  params: Promise<{ component: string }>;
  searchParams: Promise<{ theme?: string; scenario?: string }>;
}
async function Content({
  area,
  ...props
}: CatalogPageProps & { area: "admin" | "public" }) {
  const { component } = await props.params;
  const { theme, scenario = "default" } = await props.searchParams;
  const action =
    area === "public" && publicExamples.find((item) => item.id === component);
  if (action) {
    if (!action.scenarios.some((item) => item.id === scenario)) {
      notFound();
    }
    return (
      <PublicActionPreview
        example={action.id}
        scenario={scenario}
        dark={theme === "dark"}
      />
    );
  }
  if (
    component !== "showcase" &&
    !catalogItems.some((item) => item.id === component)
  ) {
    notFound();
  }
  const Component = area === "admin" ? AdminPreview : PublicPreview;
  return <Component dark={theme === "dark"} name={component} />;
}
export function CatalogPage(
  props: CatalogPageProps & { area: "admin" | "public" }
) {
  return (
    <Suspense fallback={null}>
      <Content {...props} />
    </Suspense>
  );
}
