"use client";

import { useEffect, useRef, useState } from "react";

import FileDownload from "@/components/icons/outline/file-download";
import { ActionButton } from "@/components/ui/action-button";
import { resetQueryCache } from "@/trpc/query-client";

const saveCsv = async (href: string, filename: string, signal: AbortSignal) => {
  try {
    const response = await fetch(href, {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      await resetQueryCache();
      window.location.assign("/admin");
    }
    if (
      !response.ok ||
      !response.headers.get("Content-Type")?.includes("text/csv")
    ) {
      throw new Error("Unable to export CSV.");
    }
    const blob = await response.blob();
    if (signal.aborted) {
      return false;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      response.headers
        .get("Content-Disposition")
        ?.split('filename="')[1]
        ?.split('"')[0] || filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
    return true;
  } catch {
    return false;
  }
};

const DataTableExport = ({
  href,
  disabled = false,
  filename = "export.csv",
}: {
  href: string;
  disabled?: boolean;
  filename?: string;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const download = async () => {
    if (active.current || disabled) {
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(false);
    const saved = await saveCsv(href, filename, controller.signal);
    active.current = null;
    if (!controller.signal.aborted) {
      setPending(false);
      setError(!saved);
    }
  };
  return (
    <div className="flex flex-col items-end gap-2">
      <ActionButton
        disabled={disabled}
        icon={<FileDownload aria-hidden="true" />}
        onClick={() => {
          void download();
        }}
        pending={pending}
        pendingLabel="Exporting…"
        size="sm"
        type="button"
        variant="outline"
      >
        Export CSV
      </ActionButton>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          Unable to export CSV. Please try again.
        </p>
      ) : null}
    </div>
  );
};

export { DataTableExport };
