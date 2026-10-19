import { Button } from "@/components/admin/ui/button";
import { Spinner } from "@/components/admin/ui/spinner";

export function SpinnerPreview({ scenario }: { scenario: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
      {scenario === "button" ? (
        <Button disabled>
          <Spinner data-icon="inline-start" />
          Processing
        </Button>
      ) : scenario === "sizes" ? (
        <div className="flex items-center gap-6">
          <Spinner className="size-4" />
          <Spinner className="size-6" />
          <Spinner className="size-8" />
        </div>
      ) : (
        <Spinner />
      )}
    </main>
  );
}
