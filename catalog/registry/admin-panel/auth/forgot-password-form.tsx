"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { BackButton } from "@/components/back-button";
import UserCircle from "@/components/icons/fill/user-circle";
import { LogoIso } from "@/components/logo-iso";
import { ActionButton } from "@/components/ui/action-button";
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
import { authClient } from "@/lib/auth-client";

const schema = z.object({ email: z.email("Enter a valid email address.") });

const ForgotPasswordForm = () => {
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);
  const form = useForm<z.infer<typeof schema>>({
    defaultValues: { email: "" },
    resolver: zodResolver(schema),
  });
  const onSubmit = async ({ email }: z.infer<typeof schema>) => {
    if (submitting.current) {
      return;
    }
    submitting.current = true;
    form.clearErrors("root");
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/admin/reset-password",
      });
      submitting.current = false;
      if (error) {
        form.setError("root", {
          message:
            error.status === 429
              ? "Too many requests. Please wait and try again."
              : "Unable to request a reset link. Please try again.",
        });
        return;
      }
      setSent(true);
    } catch {
      form.setError("root", {
        message: "Unable to connect. Please try again.",
      });
      submitting.current = false;
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <LogoIso className="h-10 w-auto self-start" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email to request a password reset link.
        </p>
      </div>
      {sent ? (
        <output className="text-sm">
          If an account exists for that email, you will receive a password reset
          link. Check your inbox and spam folder.
        </output>
      ) : (
        <form
          aria-busy={form.formState.isSubmitting}
          onSubmit={(event) => {
            void form.handleSubmit(onSubmit)(event);
          }}
        >
          <FieldGroup>
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="recovery-email">Email</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      aria-describedby={
                        fieldState.invalid ? "recovery-email-error" : undefined
                      }
                      aria-invalid={fieldState.invalid}
                      autoComplete="email"
                      id="recovery-email"
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
                      id="recovery-email-error"
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
                pendingLabel="Sending link…"
                size="lg"
                type="submit"
              >
                Send reset link
              </ActionButton>
            </Field>
          </FieldGroup>
        </form>
      )}
      <BackButton className="-mt-2 self-start" href="/admin" variant="ghost">
        Back to sign in
      </BackButton>
    </div>
  );
};

export { ForgotPasswordForm };
