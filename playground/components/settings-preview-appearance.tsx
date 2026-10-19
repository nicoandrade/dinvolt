"use client";

import { useSearchParams } from "next/navigation";
import { useLayoutEffect } from "react";

// Only appearance depends on the query string; the settings UI prerenders.
const SettingsPreviewAppearance = () => {
  const params = useSearchParams();
  const theme = params.get("theme");
  useLayoutEffect(() => {
    if (theme) {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);
  return null;
};

export { SettingsPreviewAppearance };
