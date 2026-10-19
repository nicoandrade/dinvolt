import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LoginView } from "@/components/login-view";

export const metadata: Metadata = {
  title: "Forgot your password?",
  robots: { follow: false, index: false },
  referrer: "no-referrer",
};

const Page = () => (
  <LoginView>
    <ForgotPasswordForm />
  </LoginView>
);

export default Page;
