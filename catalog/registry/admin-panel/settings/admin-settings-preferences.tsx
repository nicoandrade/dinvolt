"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { SettingsFormActions } from "@/components/settings-form-actions";
import { SettingsSection } from "@/components/settings-section";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const languages = [
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Português", value: "pt" },
];
const timeZones = [
  { label: "Buenos Aires", value: "America/Argentina/Buenos_Aires" },
  { label: "New York", value: "America/New_York" },
  { label: "London", value: "Europe/London" },
  { label: "UTC", value: "UTC" },
];
const dateFormats = [
  { label: "DD/MM/YYYY", value: "day-first" },
  { label: "MM/DD/YYYY", value: "month-first" },
  { label: "YYYY-MM-DD", value: "year-first" },
];
const selectFields = [
  { name: "language", label: "Language", items: languages },
  { name: "timeZone", label: "Time zone", items: timeZones },
  { name: "dateFormat", label: "Date format", items: dateFormats },
] as const;

const preferencesSchema = z.object({
  language: z.enum(["en", "es", "pt"]),
  timeZone: z.enum([
    "America/Argentina/Buenos_Aires",
    "America/New_York",
    "Europe/London",
    "UTC",
  ]),
  dateFormat: z.enum(["day-first", "month-first", "year-first"]),
  compactTables: z.boolean(),
});

const AdminSettingsPreferences = () => {
  const id = useId();
  const form = useForm<z.infer<typeof preferencesSchema>>({
    defaultValues: {
      language: "en",
      timeZone: "UTC",
      dateFormat: "day-first",
      compactTables: false,
    },
    resolver: zodResolver(preferencesSchema),
  });
  return (
    <form
      aria-label="Preferences settings"
      className="flex w-full max-w-4xl flex-col gap-8"
      noValidate
      onSubmit={form.handleSubmit((values) => form.reset(values))}
    >
      <SettingsSection
        description="Example language, time zone and date preferences."
        title="Localization"
        titleId={`${id}-localization`}
      >
        <FieldGroup>
          {selectFields.map((config) => (
            <Controller
              control={form.control}
              key={config.name}
              name={config.name}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-${config.name}`}>
                    {config.label}
                  </FieldLabel>
                  <Select
                    items={config.items}
                    name={field.name}
                    onValueChange={(value) => field.onChange(value)}
                    value={field.value}
                  >
                    <SelectTrigger
                      aria-describedby={
                        fieldState.invalid
                          ? `${id}-${config.name}-error`
                          : undefined
                      }
                      aria-invalid={fieldState.invalid}
                      className="w-full"
                      id={`${id}-${config.name}`}
                      onBlur={() => field.onBlur()}
                      ref={field.ref}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {config.items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid ? (
                    <FieldError
                      errors={[fieldState.error]}
                      id={`${id}-${config.name}-error`}
                    />
                  ) : null}
                </Field>
              )}
            />
          ))}
        </FieldGroup>
      </SettingsSection>
      <SettingsSection
        description="Example display options for your admin panel."
        title="Display"
        titleId={`${id}-display`}
      >
        <Controller
          control={form.control}
          name="compactTables"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-compact`}>
                  Compact tables
                </FieldLabel>
                <FieldDescription id={`${id}-compact-help`}>
                  Prefer denser rows when displaying lists of records.
                </FieldDescription>
              </FieldContent>
              <Switch
                aria-describedby={`${id}-compact-help`}
                checked={field.value}
                id={`${id}-compact`}
                name={field.name}
                onBlur={() => field.onBlur()}
                onCheckedChange={(checked) => field.onChange(checked)}
                ref={field.ref}
              />
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

export { AdminSettingsPreferences };
