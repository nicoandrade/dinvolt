/* eslint-disable jsx-a11y/prefer-tag-over-role -- An SVG loading icon needs status semantics; output is an HTML element. */
import { cn } from "cn";
import type { ComponentProps } from "react";

function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn(
        "size-4 animate-spin [animation-duration:500ms] motion-reduce:animate-none",
        className
      )}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        className="fill-current"
        d="M75.4 126.63a11.43 11.43 0 0 1-2.1-22.65 40.9 40.9 0 0 0 30.5-30.6 11.4 11.4 0 1 1 22.27 4.87h.02a63.77 63.77 0 0 1-47.8 48.05v-.02a11.38 11.38 0 0 1-2.93.37z"
      />
    </svg>
  );
}

export { Spinner };
