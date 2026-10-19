import { CatalogPage } from "@/playground/catalog-page";
import type { CatalogPageProps } from "@/playground/catalog-page";

export const instant = false;
export default function Page(props: CatalogPageProps) {
  return <CatalogPage {...props} area="admin" />;
}
