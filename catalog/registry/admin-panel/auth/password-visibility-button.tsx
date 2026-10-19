"use client";

import Eye from "@/components/icons/outline/eye";
import EyeSlash from "@/components/icons/outline/eye-slash";
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";

import "./action-button.css";

const PasswordVisibilityButton = ({
  inputId,
  visible,
  onVisibleChange,
  passwordLabel = "password",
}: {
  inputId: string;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  passwordLabel?: string;
}) => (
  <InputGroupAddon align="inline-end">
    <InputGroupButton
      aria-controls={inputId}
      aria-label={`${visible ? "Hide" : "Show"} ${passwordLabel}`}
      onClick={() => onVisibleChange(!visible)}
      size="icon-xs"
      type="button"
    >
      {/* eslint-disable shadcn/no-unknown-classes -- The t-icon classes are defined in the shared action-button.css stylesheet. */}
      <span
        aria-hidden="true"
        className="t-icon-swap items-center justify-items-center"
        data-state={visible ? "b" : "a"}
      >
        <Eye className="t-icon" data-icon="a" />
        <EyeSlash className="t-icon" data-icon="b" />
      </span>
      {/* eslint-enable shadcn/no-unknown-classes */}
    </InputGroupButton>
  </InputGroupAddon>
);

export { PasswordVisibilityButton };
