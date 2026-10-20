import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("email headers use the shared icon version and keep reset tokens out of logo URLs", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    mock.module("@react-email/components", () => ({ Img: "img", Section: "section" }));
    mock.module("@/lib/icons", () => ({ iconVersion: "0123456789abcdef" }));
    const jsx = (type, props) => ({ type, props });
    mock.module("react/jsx-runtime", () => ({ jsx, jsxs: jsx }));
    mock.module("react/jsx-dev-runtime", () => ({ jsxDEV: jsx }));
    const { EmailHeader } = await import("./catalog/auth/email-header.tsx");
    const header = EmailHeader({ baseUrl: "https://example.com/admin/reset-password?token=private" });
    assert.equal(header.props.children.props.src, "https://example.com/icons/0123456789abcdef-apple-light.png");
  `,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf-8" }
  );
  expect(result.status, result.stderr).toBe(0);
});

// Keep provider mocks and environment variables out of the other test processes.
test("recovery email requires configuration, sends both formats and sanitizes provider failures", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    let payload;
    let providerError = null;
    let calls = 0;
    mock.module("@react-email/render", () => ({
      render: async (element) => {
        assert.equal(element.props.url, "https://example.com/reset?token=private");
        return "<p>Reset your password</p>";
      },
      toPlainText: () => "Reset your password",
    }));
    mock.module("react", () => ({ createElement: (_, props) => ({ props }) }));
    mock.module("@/emails/reset-password-email", () => ({ ResetPasswordEmail: () => null }));
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer re_test");
      assert.ok(options.signal instanceof AbortSignal);
      payload = JSON.parse(options.body);
      calls++;
      return Response.json(providerError ?? { id: "test" }, { status: providerError ? 422 : 200 });
    };
    const { sendPasswordResetEmail } = await import("./catalog/auth/email.ts");
    const message = { to: "test@example.com", url: "https://example.com/reset?token=private" };
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    await assert.rejects(() => sendPasswordResetEmail(message), /Configure RESEND_API_KEY/);
    process.env.RESEND_API_KEY = "re_test";
    await assert.rejects(() => sendPasswordResetEmail(message), /Configure RESEND_API_KEY/);
    assert.equal(calls, 0);
    process.env.EMAIL_FROM = "App <accounts@example.com>";
    await sendPasswordResetEmail(message);
    assert.deepEqual(payload, {
      from: "App <accounts@example.com>", to: "test@example.com",
      subject: "Reset your password", html: "<p>Reset your password</p>", text: "Reset your password",
    });
    providerError = { message: "private provider payload" };
    await assert.rejects(() => sendPasswordResetEmail(message), error => error.message === "Password recovery email could not be sent.");
  `,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf-8" }
  );
  expect(result.status, result.stderr).toBe(0);
});
