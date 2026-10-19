"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import AtSign from "@/components/icons/fill/at-sign";
import UserCircle from "@/components/icons/fill/user-circle";
import Edit from "@/components/icons/outline/edit";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { adminIdentityQueryKey } from "@/lib/admin-identity";
import type { AdminIdentity } from "@/lib/admin-identity";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { resetQueryCache } from "@/trpc/query-client";

const editUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
});
type EditUserValues = z.infer<typeof editUserSchema>;
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
] as const;

const EditUserSheet = ({
  user,
}: {
  user?: EditUserValues & { id: string };
}) => {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const submitting = useRef(false);
  const id = useId();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const form = useForm<EditUserValues>({
    defaultValues: { name: "", email: "" },
    resolver: zodResolver(editUserSchema),
  });
  const pending = form.formState.isSubmitting;
  const onSubmit = async (values: EditUserValues) => {
    if (!user || submitting.current) {
      return;
    }
    submitting.current = true;
    form.clearErrors("root");
    try {
      const result = await authClient.admin.updateUser({
        userId: user.id,
        data: values,
      });
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
          message: "Unable to update the user. Please try again.",
        });
        return;
      }
      queryClient.setQueryData<AdminIdentity>(
        adminIdentityQueryKey,
        (identity) =>
          identity?.id === user.id
            ? {
                ...identity,
                name: values.name,
                email: values.email.toLowerCase(),
              }
            : identity
      );
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.user.pathKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.users.pathKey(),
      });
      setOpen(false);
      setSuccess(true);
    } catch {
      submitting.current = false;
      form.setError("root", {
        message:
          "Unable to confirm the update. Check the user details before trying again.",
      });
    }
  };
  return (
    <>
      <output className="text-muted-foreground text-sm">
        {success ? "User updated successfully." : ""}
      </output>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (submitting.current || pending) {
            return;
          }
          form.reset({ name: user?.name ?? "", email: user?.email ?? "" });
          setSuccess(false);
          setOpen(nextOpen);
        }}
      >
        <SheetTrigger
          disabled={!user}
          render={<Button size="sm" variant="outline" />}
        >
          <Edit aria-hidden="true" />
          Edit user
        </SheetTrigger>
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="mr-8">Edit user</SheetTitle>
            <SheetDescription>
              Update this user&apos;s account details.
            </SheetDescription>
          </SheetHeader>
          <form
            aria-busy={pending}
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
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor={`${id}-${config.name}`}>
                            {config.label}
                          </FieldLabel>
                          <InputGroup>
                            <InputGroupInput
                              {...field}
                              aria-describedby={
                                fieldState.invalid
                                  ? `${id}-${config.name}-error`
                                  : undefined
                              }
                              aria-invalid={fieldState.invalid}
                              id={`${id}-${config.name}`}
                              placeholder={config.placeholder}
                              required
                              type={config.type}
                            />
                            <InputGroupAddon>{config.icon}</InputGroupAddon>
                          </InputGroup>
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
                pendingLabel="Saving changes…"
                type="submit"
              >
                Save changes
              </ActionButton>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
};

export { EditUserSheet };
