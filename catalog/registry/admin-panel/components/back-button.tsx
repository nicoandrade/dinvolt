"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import CircleChevronLeft from "@/components/icons/fill/circle-chevron-left";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BackButtonProps = Omit<
  ComponentProps<typeof Link>,
  "children" | "className"
> & {
  children: ReactNode;
  className?: string;
  variant?: "back" | "ghost";
};

const BackButton = ({
  children,
  className,
  variant = "back",
  ...props
}: BackButtonProps) => (
  <Link
    {...props}
    className={cn(
      buttonVariants({ size: "sm", variant: "ghost" }),
      // The back presentation belongs to this component; custom presets may not
      // extend buttonVariants with Dinvolt's optional back variant.
      variant === "back" &&
        "hover:text-foreground [&_svg]:text-muted-foreground/60 hover:[&_svg]:text-foreground border-0 bg-transparent px-0 hover:bg-transparent has-data-[icon=inline-end]:pr-0 has-data-[icon=inline-start]:pl-0 dark:hover:bg-transparent [&_svg]:transition-colors",
      "text-muted-foreground w-fit",
      className
    )}
    data-slot="button"
  >
    <CircleChevronLeft aria-hidden="true" data-icon="inline-start" />
    {children}
  </Link>
);

export { BackButton };
export type { BackButtonProps };
