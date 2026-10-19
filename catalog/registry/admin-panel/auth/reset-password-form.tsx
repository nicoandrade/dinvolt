"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { BackButton } from "@/components/back-button";
import Password from "@/components/icons/fill/password";
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
import { PasswordVisibilityButton } from "@/components/ui/password-visibility-button";
import { authClient } from "@/lib/auth-client";
import { resetQueryCache } from "@/trpc/query-client";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(128, "Use no more than 128 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const subscribeToUrl = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const getSearch = () => window.location.search;
const getServerSearch = () => null;

const ResetPasswordForm = () => {
  // Hydrate the URL without suspending the prerendered form or reading a session.
  const search = useSyncExternalStore(
    subscribeToUrl,
    getSearch,
    getServerSearch
  );
  const params = new URLSearchParams(search ?? "");
  const token = params.get("token");
  const [rejected, setRejected] = useState(false);
  const [complete, setComplete] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    confirmPassword: false,
  });
  const invalid =
    !complete &&
    (rejected || (search !== null && (!token || params.has("error"))));
  const submitting = useRef(false);
  const form = useForm<z.infer<typeof schema>>({
    defaultValues: { password: "", confirmPassword: "" },
    resolver: zodResolver(schema),
  });
  const onSubmit = async ({ password }: z.infer<typeof schema>) => {
    if (!token || invalid || submitting.current) {
      return;
    }
    submitting.current = true;
    form.clearErrors("root");
    try {
      const { error } = await authClient.resetPassword({
        token,
        newPassword: password,
      });
      submitting.current = false;
      if (error) {
        if (error.code === "INVALID_TOKEN" || error.code === "TOKEN_EXPIRED") {
          setRejected(true);
        } else {
          form.setError("root", {
            message: "Unable to reset your password. Please try again.",
          });
        }
        return;
      }
      setComplete(true);
      form.reset();
      window.history.replaceState(
        window.history.state,
        "",
        "/admin/reset-password"
      );
      await resetQueryCache();
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
        <h1 className="text-xl font-bold">Reset your password</h1>
        <p className="text-muted-foreground text-sm">
          Choose a new password with at least 8 characters.
        </p>
      </div>
      {complete && (
        <output className="text-sm">
          Your password has been reset. Sign in with your new password.
        </output>
      )}
      {invalid && (
        <p className="text-destructive text-sm" role="alert">
          This reset link is invalid or has expired. Request a new link to
          continue.
        </p>
      )}
      {!complete && !invalid && (
        <form
          aria-busy={form.formState.isSubmitting}
          onSubmit={(event) => {
            void form.handleSubmit(onSubmit)(event);
          }}
        >
          <FieldGroup>
            {(
              [
                { name: "password", label: "New password" },
                { name: "confirmPassword", label: "Confirm new password" },
              ] as const
            ).map(({ name, label }) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`reset-${name}`}>{label}</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        aria-describedby={
                          fieldState.invalid ? `reset-${name}-error` : undefined
                        }
                        aria-invalid={fieldState.invalid}
                        autoComplete="new-password"
                        id={`reset-${name}`}
                        placeholder="Enter your new password"
                        required
                        type={visiblePasswords[name] ? "text" : "password"}
                      />
                      <InputGroupAddon>
                        <Password aria-hidden="true" />
                      </InputGroupAddon>
                      <PasswordVisibilityButton
                        inputId={`reset-${name}`}
                        onVisibleChange={(visible) =>
                          setVisiblePasswords((current) => ({
                            ...current,
                            [name]: visible,
                          }))
                        }
                        passwordLabel={
                          name === "password"
                            ? "new password"
                            : "password confirmation"
                        }
                        visible={visiblePasswords[name]}
                      />
                    </InputGroup>
                    {fieldState.invalid && (
                      <FieldError
                        errors={[fieldState.error]}
                        id={`reset-${name}-error`}
                      />
                    )}
                  </Field>
                )}
              />
            ))}
            {form.formState.errors.root && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}
            <Field>
              <ActionButton
                disabled={!token}
                pending={form.formState.isSubmitting}
                pendingLabel="Resetting password…"
                size="lg"
                type="submit"
              >
                Reset password
              </ActionButton>
            </Field>
          </FieldGroup>
        </form>
      )}
      {invalid && (
        <Link
          className="text-sm underline underline-offset-4"
          href="/admin/forgot-password"
        >
          Request a new reset link
        </Link>
      )}
      <BackButton className="-mt-2 self-start" href="/admin" variant="ghost">
        Back to sign in
      </BackButton>
    </div>
  );
};

export { ResetPasswordForm };
