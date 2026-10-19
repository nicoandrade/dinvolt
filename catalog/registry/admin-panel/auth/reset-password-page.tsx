import type { Metadata } from "next";

import { LoginView } from "@/components/login-view";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { follow: false, index: false },
  referrer: "no-referrer",
};

const Page = () => (
  <LoginView>
    <ResetPasswordForm />
  </LoginView>
);

export default Page;
