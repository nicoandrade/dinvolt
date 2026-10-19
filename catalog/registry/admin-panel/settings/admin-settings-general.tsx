"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { ImageUpload } from "@/components/image-upload";
import { SettingsFormActions } from "@/components/settings-form-actions";
import { SettingsSection } from "@/components/settings-section";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const generalSchema = z.object({
  name: z.string().trim().min(1, "Enter an application name.").max(80),
  description: z.string().trim().max(280, "Use 280 characters or fewer."),
  logo: z
    .file()
    .max(2 * 1024 * 1024, "Choose an image smaller than 2 MB.")
    .mime(
      ["image/png", "image/jpeg", "image/webp"],
      "Choose a PNG, JPEG or WebP image."
    )
    .nullable(),
});

const AdminSettingsGeneral = () => {
  const id = useId();
  const form = useForm<z.infer<typeof generalSchema>>({
    defaultValues: { name: "Acme", description: "", logo: null },
    resolver: zodResolver(generalSchema),
  });
  return (
    <form
      aria-label="General settings"
      className="flex w-full max-w-4xl flex-col gap-8"
      noValidate
      onSubmit={form.handleSubmit((values) => form.reset(values))}
    >
      <SettingsSection
        description="The basic information that identifies your application."
        title="Application"
        titleId={`${id}-application`}
      >
        <FieldGroup>
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-name`}>Application name</FieldLabel>
                <Input
                  {...field}
                  aria-describedby={
                    fieldState.invalid ? `${id}-name-error` : undefined
                  }
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  id={`${id}-name`}
                  placeholder="Acme"
                  required
                />
                {fieldState.invalid ? (
                  <FieldError
                    errors={[fieldState.error]}
                    id={`${id}-name-error`}
                  />
                ) : null}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-description`}>
                  Description
                </FieldLabel>
                <Textarea
                  {...field}
                  aria-describedby={`${id}-description-help${fieldState.invalid ? ` ${id}-description-error` : ""}`}
                  aria-invalid={fieldState.invalid}
                  id={`${id}-description`}
                  placeholder="A workspace to manage your team's daily operations."
                  rows={3}
                />
                <FieldDescription id={`${id}-description-help`}>
                  A short description of your application. Up to 280 characters.
                </FieldDescription>
                {fieldState.invalid ? (
                  <FieldError
                    errors={[fieldState.error]}
                    id={`${id}-description-error`}
                  />
                ) : null}
              </Field>
            )}
          />
        </FieldGroup>
      </SettingsSection>
      <SettingsSection
        description="Choose an image to represent your application."
        title="Branding"
        titleId={`${id}-branding`}
      >
        <Controller
          control={form.control}
          name="logo"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${id}-logo`}>Logo</FieldLabel>
              <ImageUpload
                describedBy={`${id}-logo-help${fieldState.invalid ? ` ${id}-logo-error` : ""}`}
                id={`${id}-logo`}
                invalid={fieldState.invalid}
                onBlur={() => field.onBlur()}
                onChange={(file) => {
                  form.setValue("logo", file, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                ref={field.ref}
                value={field.value}
              />
              <FieldDescription id={`${id}-logo-help`}>
                PNG, JPEG or WebP, up to 2 MB. The image stays in your browser.
              </FieldDescription>
              {fieldState.invalid ? (
                <FieldError
                  errors={[fieldState.error]}
                  id={`${id}-logo-error`}
                />
              ) : null}
            </Field>
          )}
        />
      </SettingsSection>
      <SettingsFormActions
        dirty={form.formState.isDirty}
        onDiscard={() => form.reset()}
        previewed={form.formState.isSubmitSuccessful}
      />
    </form>
  );
};

export { AdminSettingsGeneral };
