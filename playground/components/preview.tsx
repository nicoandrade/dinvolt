"use client";

import AdminError from "@/app/(admin)/admin/error";
import { AdminHome } from "@/components/admin/admin-home";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminUser } from "@/components/admin/admin-user";
import { AdminUsers } from "@/components/admin/admin-users";
import { LoginForm } from "@/components/admin/login-form";
import { AccessDenied, LoginView } from "@/components/admin/login-view";
import { SignOutButton } from "@/components/admin/sign-out-button";

import { ActionButtonPreview } from "./action-button-preview";
import { DeleteButtonPreview } from "./delete-button-preview";
import { PreviewEnvironment, usePreviewReady } from "./environment";
import { SpinnerPreview } from "./spinner-preview";

const UsersPreview = ({ scenario }: { scenario: string }) => {
  const ready = usePreviewReady();
  return (
    <AdminUsers
      viewerId={scenario === "skeleton" ? "preview-pending" : "preview-admin"}
      enabled={ready && scenario !== "skeleton"}
      userHref={(id) => `/preview/user?userId=${encodeURIComponent(id)}`}
    />
  );
};

const UserPreview = ({
  scenario,
  userId,
}: {
  scenario: string;
  userId?: string;
}) => {
  const ready = usePreviewReady();
  return (
    <AdminUser
      userId={
        userId ?? (scenario === "missing" ? "missing-user" : "preview-user-2")
      }
      viewerId="preview-admin"
      enabled={ready && scenario !== "skeleton"}
      backHref="/preview/users"
    />
  );
};

export function Preview({
  example,
  scenario,
  dark,
  userId,
}: {
  example: string;
  scenario: string;
  dark: boolean;
  userId?: string;
}) {
  let content;
  if (example === "login") {
    content = (
      <LoginView>
        {scenario === "denied" ? <AccessDenied /> : <LoginForm />}
      </LoginView>
    );
  } else if (example === "users") {
    content = (
      <AdminShell
        currentPath="/admin/users"
        user={{ name: "Alex Morgan", email: "alex@example.com" }}
      >
        <UsersPreview scenario={scenario} />
      </AdminShell>
    );
  } else if (example === "user") {
    content = (
      <AdminShell
        currentPath={`/admin/users/${encodeURIComponent(userId ?? (scenario === "missing" ? "missing-user" : "preview-user-2"))}`}
        breadcrumbParentHref="/preview/users"
        user={{ name: "Alex Morgan", email: "alex@example.com" }}
      >
        <UserPreview scenario={scenario} userId={userId} />
      </AdminShell>
    );
  } else if (example === "home") {
    content = (
      <AdminShell
        currentPath="/admin/home"
        user={
          scenario === "skeleton"
            ? undefined
            : { name: "Alex Morgan", email: "alex@example.com" }
        }
      >
        <AdminHome name={scenario === "skeleton" ? undefined : "Alex Morgan"} />
      </AdminShell>
    );
  } else if (example === "action-button") {
    content = <ActionButtonPreview scenario={scenario} />;
  } else if (example === "delete-button") {
    content = <DeleteButtonPreview scenario={scenario} />;
  } else if (example === "spinner") {
    content = <SpinnerPreview scenario={scenario} />;
  } else if (example === "error") {
    content = <AdminError retry={() => window.location.reload()} />;
  } else {
    content = (
      <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          {example === "sign-out" ? <SignOutButton /> : <LoginForm />}
        </div>
      </main>
    );
  }
  return (
    <PreviewEnvironment
      key={`${example}:${userId}`}
      dark={dark}
      mockAuth={
        example !== "spinner" &&
        example !== "action-button" &&
        example !== "delete-button" &&
        (scenario !== "skeleton" || example === "users" || example === "user")
      }
      scenario={scenario}
    >
      {content}
    </PreviewEnvironment>
  );
}
