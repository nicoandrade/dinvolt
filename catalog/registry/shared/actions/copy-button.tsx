"use client";

import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

import Check from "@/components/icons/outline/check";
import Copy from "@/components/icons/outline/copy";
import { Button } from "@/components/ui/button";

import "./action-button.css";

type CopyButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "type" | "render" | "nativeButton"
> & {
  value: string;
  children?: ReactNode;
  inline?: boolean;
};

const CopyButtonContent = ({
  value,
  children = value,
  inline = false,
  className,
  disabled,
  onClick,
  size = "sm",
  variant = "ghost",
  ...props
}: CopyButtonProps) => {
  const operation = useRef<{
    active: boolean;
    pending: boolean;
    timeout?: ReturnType<typeof setTimeout>;
  }>({ active: true, pending: false });
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const copied = status === "copied";
  const failed = status === "error";

  useEffect(() => {
    const current = {
      active: true,
      pending: false,
    } as typeof operation.current;
    operation.current = current;
    return () => {
      current.active = false;
      clearTimeout(current.timeout);
    };
  }, []);

  const copy = async () => {
    const { current } = operation;
    if (disabled || current.pending) {
      return;
    }
    current.pending = true;
    clearTimeout(current.timeout);
    setStatus("idle");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      current.pending = false;
      if (current.active) {
        setStatus("error");
      }
      return;
    }
    current.pending = false;
    if (!current.active) {
      return;
    }
    setStatus("copied");
    current.timeout = setTimeout(() => setStatus("idle"), 2000);
  };

  return (
    <>
      <Button
        {...props}
        aria-label={props["aria-label"] ?? `Copy to clipboard: ${value}`}
        className={cn(
          variant === "ghost" &&
            "hover:bg-transparent dark:hover:bg-transparent",
          inline &&
            "h-auto max-w-full justify-start gap-1.5 border-0 p-0 text-left whitespace-normal has-data-[icon=inline-end]:pr-0",
          className
        )}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            void copy();
          }
        }}
        size={size}
        title={props.title ?? "Copy to clipboard"}
        type="button"
        variant={variant}
      >
        {size?.startsWith("icon") ? null : (
          <span className="min-w-0 wrap-anywhere">{children}</span>
        )}
        <span
          aria-hidden="true"
          className="t-icon-swap shrink-0 items-center justify-items-center"
          data-icon="inline-end"
          data-state={copied ? "b" : "a"}
        >
          <span className="t-icon inline-flex" data-icon="a">
            <Copy className="text-muted-foreground transition-colors group-hover/button:text-current group-focus-visible/button:text-current motion-reduce:transition-none" />
          </span>
          <span className="t-icon inline-flex" data-icon="b">
            <Check />
          </span>
        </span>
      </Button>
      <output
        aria-live="polite"
        className={failed ? "text-destructive block text-xs" : "sr-only"}
      >
        {copied
          ? "Copied to clipboard."
          : failed
            ? "Unable to copy. Please try again."
            : ""}
      </output>
    </>
  );
};

// Reset feedback and cancel pending work when a reused field changes its value.
const CopyButton = (props: CopyButtonProps) => (
  <CopyButtonContent key={props.value} {...props} />
);

export { CopyButton };
export type { CopyButtonProps };
