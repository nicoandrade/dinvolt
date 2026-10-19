"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoginForm } from "@/components/login-form";
import { AccessDenied } from "@/components/login-view";
import { authClient } from "@/lib/auth-client";

// The form is prerendered and stays mounted while Better Auth checks the session.
// This check controls presentation only; protected server boundaries authorize access.
const LoginScreen = ({
  defaultValues,
}: {
  defaultValues?: { email: string; password: string };
}) => {
  const router = useRouter();
  const { data: session, isPending, error } = authClient.useSession();
  const user =
    !isPending && !error && !session?.user.banned ? session?.user : null;
  const admin =
    user?.role?.split(",").some((role) => role.trim() === "admin") ?? false;

  useEffect(() => {
    if (admin) {
      router.replace("/admin/home");
    }
  }, [admin, router]);

  return user && !admin ? (
    <AccessDenied />
  ) : (
    <LoginForm defaultValues={defaultValues} />
  );
};

export { LoginScreen };
