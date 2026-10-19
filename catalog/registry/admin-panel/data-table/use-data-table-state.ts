"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import type { z } from "zod";

import { readTableQuery, writeTableQuery } from "@/lib/table-query";
import type { TableQuery } from "@/lib/table-query";

const locationEvent = "dinvolt:table-location";
const notifyLocation = () => window.dispatchEvent(new Event(locationEvent));
const subscribe = (notify: () => void) => {
  window.addEventListener(locationEvent, notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener(locationEvent, notify);
    window.removeEventListener("popstate", notify);
  };
};
const getSearch = () => window.location.search;
const getServerSearch = () => null;

// Only this invisible observer reads Next's request-dependent search params.
// Mount it with ssr: false so controls and headers can prerender independently.
const DataTableStateSync = () => {
  const params = useSearchParams();
  useEffect(() => {
    if (params) {
      notifyLocation();
    }
  }, [params]);
  return null;
};

const useDataTableState = <T extends TableQuery>(schema: z.ZodType<T>) => {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const state = readTableQuery(schema, new URLSearchParams(search ?? ""));
  const update = (patch: Partial<T>, history: "push" | "replace" = "push") => {
    // Read the live URL so overlapping search/filter events never overwrite each other.
    const params = new URLSearchParams(window.location.search);
    const current = readTableQuery(schema, params);
    const resetsPage = Object.keys(patch).some((key) => key !== "page");
    const next = schema.parse({
      ...current,
      ...(resetsPage ? { page: 1 } : {}),
      ...patch,
    });
    const query = writeTableQuery(schema, params, next).toString();
    const href = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (
      href ===
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    ) {
      return;
    }
    // Next's native history integration updates useSearchParams without an RSC request.
    window.history[history === "push" ? "pushState" : "replaceState"](
      null,
      "",
      href
    );
    notifyLocation();
  };
  return { state, update, ready: search !== null };
};

export { DataTableStateSync, useDataTableState };
