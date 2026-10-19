"use client";

import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import CircleWarning from "@/components/icons/outline/circle-warning";
import Trash from "@/components/icons/outline/trash";
import { ActionButtonContent } from "@/components/ui/action-button";
import type { ActionButtonProps } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";

const deleteIcon = <Trash />;
const confirmIcon = <CircleWarning />;

type DeleteButtonProps = Omit<
  ActionButtonProps,
  "children" | "pendingLabel" | "onClick" | "type" | "render" | "nativeButton"
> & {
  children?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  onDelete: () => void;
};

const DeleteButton = ({
  children = "Delete",
  confirmLabel = "Are you sure?",
  pendingLabel = "Deleting…",
  icon = deleteIcon,
  pending,
  disabled,
  onDelete,
  size = "default",
  variant = "destructive",
  className,
  ...props
}: DeleteButtonProps) => {
  const container = useRef<HTMLSpanElement>(null);
  const armed = useRef(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const reset = () => {
      armed.current = false;
      setConfirming(false);
    };
    if (disabled || pending) {
      reset();
      return;
    }
    if (!confirming) {
      return;
    }
    const document = container.current?.ownerDocument;
    if (!document) {
      return;
    }
    const outside = (event: Event) => {
      if (!event.composedPath().includes(container.current as EventTarget)) {
        reset();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        reset();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [confirming, disabled, pending]);

  const label = pending ? pendingLabel : confirming ? confirmLabel : children;

  return (
    <span className="inline-flex" ref={container}>
      <Button
        {...props}
        aria-busy={pending}
        aria-label={label}
        className={cn(
          variant === "destructive" &&
            "text-[color-mix(in_oklch,var(--destructive),var(--foreground)_25%)]",
          className
        )}
        data-confirming={confirming}
        disabled={disabled || pending}
        onClick={(event) => {
          // A double-click only arms confirmation; deletion needs a new click.
          if (disabled || pending || event.detail > 1) {
            return;
          }
          if (!armed.current) {
            armed.current = true;
            setConfirming(true);
            return;
          }
          armed.current = false;
          setConfirming(false);
          onDelete();
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.repeat && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
          }
        }}
        size={size}
        title={props.title ?? label}
        type="button"
        variant={variant}
      >
        <ActionButtonContent
          alternateIcon={confirmIcon}
          icon={icon}
          iconOnly={size?.startsWith("icon")}
          pending={pending}
          pendingLabel={pendingLabel}
          sizeToLabel
          showAlternateIcon={confirming}
        >
          {confirming ? confirmLabel : children}
        </ActionButtonContent>
      </Button>
      <output aria-live="polite" className="sr-only">
        {pending || confirming ? label : ""}
      </output>
    </span>
  );
};

export { DeleteButton };
export type { DeleteButtonProps };
