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
      buttonVariants({ size: "sm", variant }),
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
