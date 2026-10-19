"use client";

import { useEffect, useRef, useState } from "react";

import { DeleteButton } from "@/components/admin/ui/delete-button";

const variants = [
  { id: "combined", title: "Icon and text", size: "sm" },
  { id: "text", title: "Text only", size: "sm" },
  { id: "icon", title: "Icon only", size: "icon-sm" },
] as const;

function DeleteExample({
  variant,
  scenario,
}: {
  variant: (typeof variants)[number];
  scenario: string;
}) {
  const [pending, setPending] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current !== null) {
        clearTimeout(timeout.current);
      }
    },
    []
  );

  const remove = () => {
    if (pending) {
      return;
    }
    setPending(true);
    setResult("");
    setAttempts((value) => value + 1);
    // Only preview feedback: no record or remote API is touched.
    timeout.current = setTimeout(() => {
      setPending(false);
      setResult(
        scenario === "error"
          ? "Unable to delete. Try again."
          : "Deleted successfully."
      );
    }, 1200);
  };

  return (
    <section
      aria-label={variant.title}
      className="flex flex-col items-center gap-4"
    >
      <h2 className="text-muted-foreground text-sm">{variant.title}</h2>
      <DeleteButton
        disabled={scenario === "disabled"}
        icon={variant.id === "text" ? null : undefined}
        onDelete={remove}
        pending={scenario === "pending" || pending}
        size={variant.size}
      />
      <p className="text-muted-foreground text-xs">Delete calls: {attempts}</p>
      <p aria-live="polite" className="min-h-5 text-sm">
        {result}
      </p>
    </section>
  );
}

export function DeleteButtonPreview({ scenario }: { scenario: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-medium">Two-step deletion</h1>
        <p className="text-muted-foreground text-sm">
          Click once to confirm, then click again to delete. Click outside or
          press Escape to cancel.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-10">
        {variants.map((variant) => (
          <DeleteExample
            key={variant.id}
            scenario={scenario}
            variant={variant}
          />
        ))}
      </div>
      <button className="text-muted-foreground text-sm underline" type="button">
        Outside focus target
      </button>
    </main>
  );
}
