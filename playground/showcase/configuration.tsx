"use client";

// Fixed to the selected Dinvolt profile. The upstream theme editor is excluded.
export const FONTS = [{ value: "inter", name: "Inter" }];
export const STYLES = [{ name: "vega", title: "Vega" }, { name: "luma", title: "Luma" }];
export function useDesignSystemSearchParams() {
  return [{ style: "__DINVOLT_STYLE__", font: "inter", fontHeading: "", iconLibrary: "lucide" }] as const;
}
