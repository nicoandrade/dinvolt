"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { BackButton } from "@/components/back-button";
import Password from "@/components/icons/fill/password";
import UserCircle from "@/components/icons/fill/user-circle";
import { LogoIso } from "@/components/logo-iso";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Field,
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
import { authClient } from "@/lib/auth-client";
import { resetQueryCache } from "@/trpc/query-client";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const LoginForm = ({
  defaultValues,
}: {
  defaultValues?: { email: string; password: string };
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({
    defaultValues: defaultValues ?? { email: "", password: "" },
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    form.clearErrors("root");
    try {
      const result = await authClient.signIn.email(values);
      if (result.error) {
        form.setError("root", {
          message: "Unable to sign in. Check your credentials and try again.",
        });
        return;
      }
      await resetQueryCache();
      window.location.assign("/admin/home");
    } catch {
      form.setError("root", {
        message: "Unable to connect. Please try again.",
      });
    }
  };

  return (
    <form
      aria-busy={form.formState.isSubmitting}
      className="flex flex-col gap-6"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <div className="flex flex-col items-start gap-6 text-left">
        <LogoIso className="h-10 w-auto" />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">Admin sign in</h1>
          <p className="text-muted-foreground text-sm">
            Sign in with your administrator account.
          </p>
        </div>
      </div>
      <FieldGroup>
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="admin-email">Email</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  {...field}
                  aria-describedby={
                    fieldState.invalid ? "admin-email-error" : undefined
                  }
                  aria-invalid={fieldState.invalid}
                  autoComplete="username"
                  id="admin-email"
                  placeholder="name@example.com"
                  required
                  type="email"
                />
                <InputGroupAddon>
                  <UserCircle aria-hidden="true" />
                </InputGroupAddon>
              </InputGroup>
              {fieldState.invalid && (
                <FieldError
                  errors={[fieldState.error]}
                  id="admin-email-error"
                />
              )}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="admin-password">Password</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  {...field}
                  aria-describedby={
                    fieldState.invalid ? "admin-password-error" : undefined
                  }
                  aria-invalid={fieldState.invalid}
                  autoComplete="current-password"
                  id="admin-password"
                  required
                  type={showPassword ? "text" : "password"}
                />
                <InputGroupAddon>
                  <Password aria-hidden="true" />
                </InputGroupAddon>
                <PasswordVisibilityButton
                  inputId="admin-password"
                  onVisibleChange={setShowPassword}
                  visible={showPassword}
                />
              </InputGroup>
              {fieldState.invalid && (
                <FieldError
                  errors={[fieldState.error]}
                  id="admin-password-error"
                />
              )}
            </Field>
          )}
        />
        {form.formState.errors.root && (
          <p className="text-destructive text-sm" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        <Field>
          <ActionButton
            pending={form.formState.isSubmitting}
            pendingLabel="Signing in…"
            size="lg"
            type="submit"
          >
            Sign in
          </ActionButton>
        </Field>
      </FieldGroup>
      <div className="-mt-2 flex items-center justify-between gap-2">
        <BackButton href="/" variant="ghost">
          Back to home
        </BackButton>
        <Button
          // eslint-disable-next-line shadcn/no-restyle -- Password recovery intentionally uses muted text with the link variant.
          className="text-muted-foreground w-auto"
          nativeButton={false}
          render={<Link href="/admin/forgot-password" />}
          size="sm"
          variant="link"
        >
          Forgot your password?
        </Button>
      </div>
    </form>
  );
};

export { LoginForm };
