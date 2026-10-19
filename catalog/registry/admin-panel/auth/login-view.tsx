import Image from "next/image";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/sign-out-button";

import loginBackground from "./login-background.jpg";

const LoginView = ({ children }: { children: ReactNode }) => (
  <main className="bg-background relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden p-6 md:p-10">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[75svh] min-h-80 [mask-image:linear-gradient(to_bottom,transparent,black_35%)] opacity-40 dark:opacity-20"
    >
      <Image
        alt=""
        className="object-cover object-bottom grayscale dark:invert"
        fill
        loading="eager"
        sizes="100vw"
        src={loginBackground}
      />
    </div>
    <div className="bg-background/60 w-full max-w-sm rounded-3xl p-4 backdrop-blur-sm">
      {children}
    </div>
  </main>
);

const AccessDenied = () => (
  <div className="flex flex-col gap-6 text-center">
    <h1 className="text-xl font-bold">Access denied</h1>
    <p className="text-muted-foreground text-sm">
      Your account does not have admin access. Sign out to use a different
      account.
    </p>
    <SignOutButton />
  </div>
);

export { AccessDenied, LoginView };
