"use client";

import { useEffect, useRef, useState } from "react";

import { ActionButton } from "@/components/admin/ui/action-button";
import FileDownload from "@/components/icons/outline/file-download";

const variants = [
  {
    id: "combined",
    title: "Icon and text",
    label: "Export CSV",
    pendingLabel: "Exporting…",
    icon: true,
    size: "sm",
  },
  {
    id: "text",
    title: "Text only",
    label: "Save changes",
    pendingLabel: "Saving…",
    icon: false,
    size: "sm",
  },
  {
    id: "icon",
    title: "Icon only",
    label: "Export CSV",
    pendingLabel: "Exporting…",
    icon: true,
    size: "icon-sm",
  },
  {
    id: "login",
    title: "Login action",
    label: "Sign in",
    pendingLabel: "Signing in…",
    icon: false,
    size: "default",
  },
] as const;

export function ActionButtonPreview({ scenario }: { scenario: string }) {
  const [active, setActive] = useState<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current !== null) {
        clearTimeout(timeout.current);
      }
    },
    []
  );

  const run = (id: string) => {
    if (timeout.current !== null) {
      clearTimeout(timeout.current);
    }
    setActive(id);
    // Simulated work belongs only to the preview, never the shipped component.
    timeout.current = setTimeout(() => setActive(null), 1800);
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 p-6">
      <h1 className="text-lg font-medium">Action feedback</h1>
      <div className="flex flex-wrap items-center justify-center gap-10">
        {variants.map(({ id, title, label, pendingLabel, icon, size }) => (
          <section
            aria-label={title}
            className="flex flex-col items-center gap-4"
            key={id}
          >
            <h2 className="text-muted-foreground text-sm">{title}</h2>
            <ActionButton
              icon={icon ? <FileDownload /> : undefined}
              onClick={() => run(id)}
              pending={scenario === "pending" || active === id}
              pendingLabel={pendingLabel}
              size={size}
              variant={id === "login" ? "default" : "outline"}
            >
              {label}
            </ActionButton>
          </section>
        ))}
      </div>
    </main>
  );
}
