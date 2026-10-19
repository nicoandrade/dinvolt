"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import "./action-button.css";

const ActionButtonLabel = ({ label }: { label: string }) => {
  const element = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(label);

  useEffect(() => {
    const node = element.current;
    if (!node) {
      return;
    }
    if (text === label) {
      node.classList.remove("is-exit");
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const duration = getComputedStyle(node)
      .getPropertyValue("--text-swap-dur")
      .trim();
    const delay =
      Number(duration.replace(/m?s$/u, "")) *
      (duration.endsWith("ms") ? 1 : 1000);
    if (!reduced) {
      node.classList.add("is-exit");
    }
    const timeout = setTimeout(
      () => {
        node.classList.remove("is-exit");
        if (!reduced) {
          node.classList.add("is-enter-start");
        }
        setText(label);
      },
      reduced ? 0 : delay
    );
    return () => clearTimeout(timeout);
  }, [label, text]);

  useLayoutEffect(() => {
    const node = element.current;
    if (text === label && node?.classList.contains("is-enter-start")) {
      // Commit the below-text starting position before replaying the transition.
      void node.offsetHeight;
      node.classList.remove("is-enter-start");
    }
  }, [label, text]);

  return (
    <span className="t-text-swap [grid-area:1/1]" ref={element}>
      {text}
    </span>
  );
};

type ActionButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  children: string;
  pending: boolean;
  pendingLabel: string;
  icon?: ReactNode;
};

const ActionButtonIcon = ({
  icon,
  pending,
  alternateIcon,
  showAlternateIcon,
}: Pick<
  ActionButtonContentProps,
  "icon" | "pending" | "alternateIcon" | "showAlternateIcon"
>) => (
  <span
    aria-hidden="true"
    className="t-icon-swap items-center justify-items-center"
    data-state={pending ? "b" : showAlternateIcon ? "c" : "a"}
  >
    <span className="t-icon inline-flex" data-icon="a">
      {icon}
    </span>
    <span className="t-icon inline-flex" data-icon="b">
      <Spinner
        aria-hidden="true"
        className={pending ? undefined : "[animation-play-state:paused]"}
      />
    </span>
    {alternateIcon ? (
      <span className="t-icon inline-flex" data-icon="c">
        {alternateIcon}
      </span>
    ) : null}
  </span>
);

type ActionButtonContentProps = Pick<
  ActionButtonProps,
  "children" | "pending" | "pendingLabel" | "icon"
> & {
  iconOnly?: boolean;
  align?: "center" | "start";
  sizeToLabel?: boolean;
  alternateIcon?: ReactNode;
  showAlternateIcon?: boolean;
};

const ActionButtonContent = ({
  children,
  pending,
  pendingLabel,
  icon,
  iconOnly = false,
  align = "center",
  sizeToLabel = false,
  alternateIcon,
  showAlternateIcon,
}: ActionButtonContentProps) => {
  const labelContainer = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = labelContainer.current;
    const node = content.current;
    if (!sizeToLabel || iconOnly || !container || !node) {
      return;
    }
    // Measure only visible content; hidden future labels never set the width.
    const resize = () => {
      container.style.width = `${node.getBoundingClientRect().width}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => {
      observer.disconnect();
      container.style.removeProperty("width");
    };
  }, [sizeToLabel, iconOnly]);

  return (
    <>
      {icon ? (
        <ActionButtonIcon
          icon={icon}
          pending={pending}
          alternateIcon={alternateIcon}
          showAlternateIcon={showAlternateIcon}
        />
      ) : null}
      {iconOnly ? null : (
        <span
          aria-hidden="true"
          className={`${sizeToLabel ? "t-resize " : ""}inline-grid items-center justify-items-center gap-[inherit] data-[align=start]:justify-items-start`}
          data-align={align}
          ref={labelContainer}
        >
          {(sizeToLabel ? [] : [...new Set([children, pendingLabel])]).map(
            (label) => (
              <span
                className="invisible inline-flex items-center gap-[inherit] [grid-area:1/1]"
                key={label}
              >
                {icon ? null : <span className="size-4 shrink-0" />}
                {label}
              </span>
            )
          )}
          <span
            className={`t-action-content [grid-area:1/1] ${sizeToLabel ? "w-max" : ""}`}
            data-pending={pending}
            ref={content}
          >
            {icon ? null : (
              <span className="t-action-spinner">
                <ActionButtonIcon pending={pending} />
              </span>
            )}
            <ActionButtonLabel label={pending ? pendingLabel : children} />
          </span>
        </span>
      )}
    </>
  );
};

const ActionButton = ({
  children,
  pending,
  pendingLabel,
  icon,
  disabled,
  size = "default",
  type = "button",
  ...props
}: ActionButtonProps) => {
  const label = pending ? pendingLabel : children;
  return (
    <>
      <Button
        {...props}
        aria-busy={pending}
        aria-label={label}
        disabled={disabled || pending}
        size={size}
        type={type}
      >
        <ActionButtonContent
          icon={icon}
          iconOnly={size?.startsWith("icon")}
          pending={pending}
          pendingLabel={pendingLabel}
        >
          {children}
        </ActionButtonContent>
      </Button>
      <output aria-live="polite" className="sr-only">
        {pending ? pendingLabel : ""}
      </output>
    </>
  );
};

export { ActionButton, ActionButtonContent };
export type { ActionButtonProps, ActionButtonContentProps };
