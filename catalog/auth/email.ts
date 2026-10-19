import { render, toPlainText } from "@react-email/render";
import { createElement } from "react";

import { ResetPasswordEmail } from "@/emails/reset-password-email";

// Internal to auth-config, shared with the trusted auth CLI. Never import from clients.
const sendPasswordResetEmail = async ({
  to,
  url,
}: {
  to: string;
  url: string;
}) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error(
      "Configure RESEND_API_KEY and EMAIL_FROM for password recovery."
    );
  }
  const html = await render(createElement(ResetPasswordEmail, { url }));
  // Use the HTTP API to avoid SDK development logging of provider payloads.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      html,
      subject: "Reset your password",
      text: toPlainText(html),
      to,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Provider messages may contain recipient data. Never propagate them to logs.
    throw new Error("Password recovery email could not be sent.");
  }
};

export { sendPasswordResetEmail };
