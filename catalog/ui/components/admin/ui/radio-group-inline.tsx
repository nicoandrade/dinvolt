"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "cn";

function RadioGroupInline<Value = string>({
  className,
  ...props
}: RadioGroupPrimitive.Props<Value>) {
  return (
    <RadioGroupPrimitive
      aria-orientation="horizontal"
      data-slot="radio-group-inline"
      className={(state) =>
        cn(
          "bg-muted aria-invalid:ring-destructive/20 isolate flex w-full gap-1 rounded-xl p-1 aria-invalid:ring-2",
          typeof className === "function" ? className(state) : className
        )
      }
      {...props}
    />
  );
}

function RadioGroupInlineItem<Value = string>({
  children,
  className,
  value,
  ...props
}: RadioPrimitive.Root.Props<Value>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-inline-item"
      className={(state) =>
        cn(
          "text-muted-foreground hover:not-data-checked:not-data-disabled:not-data-readonly:bg-background/50 hover:not-data-checked:not-data-disabled:not-data-readonly:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background aria-invalid:ring-destructive/20 data-checked:bg-background data-checked:text-foreground relative inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md bg-transparent px-4 py-1.5 text-center text-sm font-semibold transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden aria-invalid:ring-2 data-checked:shadow-sm data-disabled:cursor-not-allowed data-disabled:opacity-50 data-readonly:cursor-default motion-reduce:transition-none",
          typeof className === "function" ? className(state) : className
        )
      }
      value={value}
      {...props}
    >
      {children ??
        (typeof value === "string" || typeof value === "number" ? value : null)}
    </RadioPrimitive.Root>
  );
}

export { RadioGroupInline, RadioGroupInlineItem };
