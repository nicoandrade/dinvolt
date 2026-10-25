"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "cn";
import { useId } from "react";
import type { ReactNode } from "react";

function RadioGroupCard<Value = string>({
  className,
  ...props
}: RadioGroupPrimitive.Props<Value>) {
  return (
    <RadioGroupPrimitive
      aria-orientation="vertical"
      data-slot="radio-group-card"
      className={(state) =>
        cn(
          "bg-muted aria-invalid:ring-destructive/20 isolate flex w-full flex-col gap-1 rounded-2xl p-1 aria-invalid:ring-2",
          typeof className === "function" ? className(state) : className
        )
      }
      {...props}
    />
  );
}

type RadioGroupCardItemProps<Value = string> =
  RadioPrimitive.Root.Props<Value> & {
    icon?: ReactNode;
    iconPosition?: "end" | "start";
  };

function RadioGroupCardItem<Value = string>({
  children,
  className,
  icon,
  iconPosition = "end",
  title,
  value,
  ...props
}: RadioGroupCardItemProps<Value>) {
  const id = useId();
  const hasDescription = children !== undefined && children !== null;
  const iconElement = icon ? (
    <span
      aria-hidden="true"
      data-slot="radio-group-card-icon"
      className="text-muted-foreground group-data-checked/radio-group-card-item:text-foreground pointer-events-none size-4.5 shrink-0 [&_svg]:size-full"
    >
      {icon}
    </span>
  ) : null;

  return (
    <RadioPrimitive.Root
      aria-labelledby={`${id}-title`}
      aria-describedby={hasDescription ? `${id}-description` : undefined}
      data-slot="radio-group-card-item"
      className={(state) =>
        cn(
          "group/radio-group-card-item text-muted-foreground hover:not-data-checked:not-data-disabled:not-data-readonly:bg-background/50 hover:not-data-checked:not-data-disabled:not-data-readonly:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background aria-invalid:ring-destructive/20 data-checked:bg-background data-checked:text-foreground relative inline-flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl bg-transparent px-4 py-3 text-start text-sm transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden aria-invalid:ring-2 data-checked:shadow-sm data-disabled:cursor-not-allowed data-disabled:opacity-50 data-readonly:cursor-default motion-reduce:transition-none",
          iconPosition === "start" && "justify-start",
          typeof className === "function" ? className(state) : className
        )
      }
      value={value}
      {...props}
    >
      {iconPosition === "start" ? iconElement : null}
      <span className="flex min-w-0 flex-col items-start gap-1 wrap-anywhere">
        <span
          id={`${id}-title`}
          data-slot="radio-group-card-title"
          className="text-sm leading-tight font-semibold"
        >
          {title ??
            (typeof value === "string" || typeof value === "number"
              ? value
              : null)}
        </span>
        {hasDescription ? (
          <span
            id={`${id}-description`}
            data-slot="radio-group-card-description"
            className="text-muted-foreground text-xs"
          >
            {children}
          </span>
        ) : null}
      </span>
      {iconPosition === "end" ? iconElement : null}
    </RadioPrimitive.Root>
  );
}

export { RadioGroupCard, RadioGroupCardItem };
export type { RadioGroupCardItemProps };
