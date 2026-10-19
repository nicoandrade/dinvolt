"use client";

import { cn } from "cn";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Ref } from "react";

import DragImage from "@/components/icons/outline/drag-image";
import { Button } from "@/components/ui/button";

interface ImageUploadProps {
  id: string;
  value: File | null;
  onChange: (file: File | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  ref?: Ref<HTMLButtonElement>;
}

// This input previews a local file. Uploading and storage belong to its caller.
const ImageUpload = ({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  ref,
}: ImageUploadProps) => {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputDescription = [
    describedBy,
    `${id}-drop-hint`,
    dropError ? `${id}-drop-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const resetDrag = () => {
    dragDepth.current = 0;
    setDragging(false);
  };
  // eslint-disable react/set-state-in-effect -- Allocate browser-owned object URLs after commit, never during a render that React may abandon; cleanup revokes them on replacement and unmount.
  useEffect(() => {
    if (
      !value ||
      !["image/png", "image/jpeg", "image/webp"].includes(value.type)
    ) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  // eslint-enable react/set-state-in-effect

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- File dragging supplements the native input and keyboard-accessible buttons; the container has no click or keyboard action.
    <fieldset
      aria-label="Image upload"
      className="flex min-w-0 flex-col gap-2"
      data-dragging={dragging}
      data-slot="image-upload"
      onDragEnd={resetDrag}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) {
          setDragging(false);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        resetDrag();
        const { files } = event.dataTransfer;
        if (files.length > 1) {
          setDropError("Drop one image at a time.");
          return;
        }
        const [file] = files;
        if (file) {
          setDropError(null);
          onChange(file);
        }
      }}
    >
      <input
        accept="image/png,image/jpeg,image/webp"
        aria-describedby={inputDescription}
        aria-invalid={invalid || !!dropError}
        className="sr-only"
        id={id}
        onBlur={onBlur}
        onChange={(event) => {
          setDropError(null);
          onChange(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
        ref={input}
        tabIndex={-1}
        type="file"
      />
      <button
        aria-describedby={inputDescription}
        aria-label={value ? "Change image" : "Choose image"}
        className={cn(
          "focus-visible:ring-ring focus-visible:ring-offset-background flex w-full min-w-0 cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none",
          dragging
            ? "border-primary bg-primary/5 ring-primary/20 ring-2"
            : "border-input",
          !dragging &&
            !invalid &&
            !dropError &&
            "hover:border-ring hover:bg-muted/50",
          !dragging && (invalid || dropError) && "border-destructive"
        )}
        data-slot="image-upload-trigger"
        onBlur={onBlur}
        onClick={() => input.current?.click()}
        ref={ref}
        type="button"
      >
        <span className="bg-muted/50 pointer-events-none flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
          {preview ? (
            <Image
              alt="Selected logo preview"
              className="size-full object-contain"
              height={64}
              draggable={false}
              src={preview}
              unoptimized
              width={64}
            />
          ) : (
            <DragImage
              aria-hidden="true"
              className="text-muted-foreground size-6"
            />
          )}
        </span>
        <span className="pointer-events-none flex min-w-0 flex-1 flex-col gap-2">
          <span
            aria-live="polite"
            className={cn("text-sm font-medium", dragging && "text-primary")}
            id={`${id}-drop-hint`}
          >
            {dragging
              ? "Drop your image here"
              : "Click to choose an image, or drag it here"}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {value?.name ?? "No image selected"}
          </span>
        </span>
      </button>
      {value ? (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setDropError(null);
              onChange(null);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Remove image
          </Button>
        </div>
      ) : null}
      {dropError ? (
        <p
          className="text-destructive text-sm"
          id={`${id}-drop-error`}
          role="alert"
        >
          {dropError}
        </p>
      ) : null}
    </fieldset>
  );
};

export { ImageUpload };
export type { ImageUploadProps };
