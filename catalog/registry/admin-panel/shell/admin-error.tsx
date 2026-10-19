"use client";

import { Button } from "@/components/admin/ui/button";

const AdminError = ({ retry }: { retry: () => void }) => (
  <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
    <div className="flex w-full max-w-sm flex-col gap-6 text-center">
      <h1 className="text-xl font-bold">Unable to verify access</h1>
      <p className="text-muted-foreground text-sm">
        Please try again in a moment.
      </p>
      <Button onClick={retry} type="button">
        Try again
      </Button>
    </div>
  </main>
);

export default AdminError;
