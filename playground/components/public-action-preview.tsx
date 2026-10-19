"use client";

import { useLayoutEffect } from "react";

import { ActionButtonPreview } from "./public-action-button-preview";
import { DeleteButtonPreview } from "./public-delete-button-preview";

export function PublicActionPreview({
  example,
  scenario,
  dark,
}: {
  example: "action-button" | "delete-button";
  scenario: string;
  dark: boolean;
}) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return example === "action-button" ? (
    <ActionButtonPreview key={scenario} scenario={scenario} />
  ) : (
    <DeleteButtonPreview key={scenario} scenario={scenario} />
  );
}
