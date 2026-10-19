"use client";

import { useState } from "react";

import { ActionButton } from "@/components/ui/action-button";
import { authClient } from "@/lib/auth-client";
import { resetQueryCache } from "@/trpc/query-client";

const useAdminSignOut = () => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signOut = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Unable to sign out. Please try again.");
        setPending(false);
        return;
      }
      await resetQueryCache();
      window.location.assign("/admin");
    } catch {
      setError("Unable to sign out. Please try again.");
      setPending(false);
    }
  };

  return { pending, error, signOut };
};

const SignOutButton = () => {
  const { pending, error, signOut } = useAdminSignOut();
  return (
    <div className="flex flex-col gap-3">
      <ActionButton
        onClick={signOut}
        pending={pending}
        pendingLabel="Signing out…"
        type="button"
        variant="outline"
      >
        Sign out
      </ActionButton>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export { SignOutButton, useAdminSignOut };
