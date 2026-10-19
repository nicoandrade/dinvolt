"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import AtSign from "@/components/icons/fill/at-sign";
import Password from "@/components/icons/fill/password";
import UserCircle from "@/components/icons/fill/user-circle";
import Plus from "@/components/icons/outline/plus";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { PasswordVisibilityButton } from "@/components/ui/password-visibility-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { resetQueryCache } from "@/trpc/query-client";

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use no more than 128 characters."),
  role: z.enum(["user", "admin"]),
});
type CreateUserValues = z.infer<typeof createUserSchema>;
const defaultValues: CreateUserValues = {
  name: "",
  email: "",
  password: "",
  role: "user",
};
const textFields = [
  {
    name: "name",
    label: "Name",
    type: "text",
    placeholder: "Alex",
    icon: <UserCircle aria-hidden="true" />,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "alex@example.com",
    icon: <AtSign aria-hidden="true" />,
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "Enter a password",
    icon: <Password aria-hidden="true" />,
  },
] as const;
const roles = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

const CreateUserSheet = () => {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);
  const id = useId();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const form = useForm<CreateUserValues>({
    defaultValues,
    resolver: zodResolver(createUserSchema),
  });
  const pending = form.formState.isSubmitting;

  const onSubmit = async (values: CreateUserValues) => {
    if (submitting.current) {
      return;
    }
    submitting.current = true;
    form.clearErrors("root");
    try {
      const result = await authClient.admin.createUser(values);
      submitting.current = false;
      if (result.error) {
        if ([401, 403].includes(result.error.status)) {
          await resetQueryCache();
          window.location.assign("/admin");
          return;
        }
        if (result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
          form.setError(
            "email",
            { message: "A user with this email already exists." },
            { shouldFocus: true }
          );
          return;
        }
        form.setError("root", {
          message: "Unable to create the user. Please try again.",
        });
        return;
      }
    } catch {
      submitting.current = false;
      form.setError("root", {
        message:
          "Unable to confirm creation. Check the users list before trying again.",
      });
      return;
    }
    form.reset(defaultValues);
    setShowPassword(false);
    setOpen(false);
    setSuccess(true);
    void queryClient.invalidateQueries({
      queryKey: trpc.admin.users.pathKey(),
    });
  };

  return (
    <>
      <output className="text-muted-foreground text-sm">
        {success ? "User created successfully." : ""}
      </output>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (submitting.current || pending) {
            return;
          }
          form.reset(defaultValues);
          setShowPassword(false);
          setSuccess(false);
          setOpen(nextOpen);
        }}
      >
        <SheetTrigger render={<Button variant="default" />}>
          <Plus aria-hidden="true" />
          Create user
        </SheetTrigger>
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="mr-8">Create user</SheetTitle>
            <SheetDescription>
              Add a new account to your application.
            </SheetDescription>
          </SheetHeader>
          <form
            aria-busy={pending}
            autoComplete="off"
            className="flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={(event) => {
              void form.handleSubmit(onSubmit)(event);
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <fieldset disabled={pending}>
                <FieldGroup>
                  {textFields.map((config) => (
                    <Controller
                      control={form.control}
                      key={config.name}
                      name={config.name}
                      render={({ field, fieldState }) => {
                        let describedBy =
                          config.name === "password"
                            ? `${id}-password-description`
                            : undefined;
                        if (fieldState.invalid) {
                          describedBy = `${id}-${config.name}-error`;
                        }
                        return (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${id}-${config.name}`}>
                              {config.label}
                            </FieldLabel>
                            <InputGroup>
                              <InputGroupInput
                                {...field}
                                aria-describedby={describedBy}
                                aria-invalid={fieldState.invalid}
                                autoComplete="off"
                                data-1p-ignore="true"
                                id={`${id}-${config.name}`}
                                placeholder={config.placeholder}
                                required
                                type={
                                  config.name === "password" && showPassword
                                    ? "text"
                                    : config.type
                                }
                              />
                              <InputGroupAddon>{config.icon}</InputGroupAddon>
                              {config.name === "password" ? (
                                <PasswordVisibilityButton
                                  inputId={`${id}-password`}
                                  onVisibleChange={setShowPassword}
                                  visible={showPassword}
                                />
                              ) : null}
                            </InputGroup>
                            {config.name === "password" ? (
                              <FieldDescription
                                id={`${id}-password-description`}
                              >
                                Use between 8 and 128 characters.
                              </FieldDescription>
                            ) : null}
                            {fieldState.invalid ? (
                              <FieldError
                                errors={[fieldState.error]}
                                id={`${id}-${config.name}-error`}
                              />
                            ) : null}
                          </Field>
                        );
                      }}
                    />
                  ))}
                  <Controller
                    control={form.control}
                    name="role"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${id}-role`}>Role</FieldLabel>
                        <Select
                          items={roles}
                          name={field.name}
                          onValueChange={(value) => field.onChange(value)}
                          value={field.value}
                          disabled={pending}
                        >
                          <SelectTrigger
                            aria-invalid={fieldState.invalid}
                            id={`${id}-role`}
                            onBlur={() => field.onBlur()}
                            ref={field.ref}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  />
                  {form.formState.errors.root ? (
                    <p className="text-destructive text-sm" role="alert">
                      {form.formState.errors.root.message}
                    </p>
                  ) : null}
                </FieldGroup>
              </fieldset>
            </div>
            <SheetFooter>
              <ActionButton
                pending={pending}
                pendingLabel="Creating user…"
                type="submit"
              >
                Create user
              </ActionButton>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
};

export { CreateUserSheet };
