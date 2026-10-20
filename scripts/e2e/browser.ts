import assert from "node:assert/strict";

import type { Browser, BrowserContext, Page } from "playwright";

import { testIdentity } from "./config.ts";

async function signIn(
  page: Page,
  origin: string,
  email: string,
  password: string
) {
  await page.goto(`${origin}/admin`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function deniedEndpoints(
  context: BrowserContext,
  origin: string,
  status: number,
  run: string
) {
  const identity = testIdentity(run);
  const input = encodeURIComponent(JSON.stringify({ json: { search: run } }));
  for (const path of [
    "/api/trpc/admin.status",
    `/api/trpc/admin.users?input=${input}`,
    "/api/admin/users/export",
  ]) {
    const response = await context.request.get(`${origin}${path}`);
    assert.equal(response.status(), status);
  }
  const response = await context.request.post(
    `${origin}/api/auth/admin/create-user`,
    {
      headers: { Origin: origin },
      data: {
        name: "Denied E2E",
        email: identity.deniedEmail,
        password: "E2E-denied-password-123",
        role: "admin",
      },
    }
  );
  assert.equal(response.status(), status);
}

export async function checkBrowser(
  browser: Browser,
  origin: string,
  run: string,
  adminPassword: string,
  userPassword: string,
  persisted: () => Promise<void>,
  step: (name: string, action: () => Promise<void>) => Promise<void>
) {
  const identity = testIdentity(run);
  const context = await browser.newContext();
  context.setDefaultTimeout(60_000);
  context.setDefaultNavigationTimeout(120_000);
  let runtimeErrors = 0;
  context.on("page", (page) =>
    page.on("pageerror", () => {
      runtimeErrors += 1;
    })
  );
  const page = await context.newPage();
  try {
    await step(
      "Anonymous access denied by pages and server endpoints",
      async () => {
        await page.goto(`${origin}/admin/users`);
        await page
          .getByRole("heading", { name: "Admin sign in", exact: true })
          .waitFor();
        assert.equal(new URL(page.url()).pathname, "/admin");
        await deniedEndpoints(context, origin, 401, run);
      }
    );
    await step(
      "Administrator signs in through the generated form",
      async () => {
        await signIn(page, origin, identity.adminEmail, adminPassword);
        await page.waitForURL(`${origin}/admin/home`);
        const session = await (
          await context.request.get(`${origin}/api/auth/get-session`)
        ).json();
        assert.equal(session.user.email, identity.adminEmail);
        assert.equal(session.user.role, "admin");
      }
    );
    await step("Create and list a user through the generated UI", async () => {
      await page.goto(`${origin}/admin/users`);
      await page
        .getByRole("button", { name: "Create user", exact: true })
        .click();
      const sheet = page.getByRole("dialog");
      await sheet.getByLabel("Name", { exact: true }).fill(`E2E User ${run}`);
      await sheet.getByLabel("Email", { exact: true }).fill(identity.userEmail);
      await sheet.getByLabel("Password", { exact: true }).fill(userPassword);
      await sheet
        .getByRole("button", { name: "Create user", exact: true })
        .click();
      await page
        .getByText("User created successfully.", { exact: true })
        .waitFor();
      await page
        .getByRole("searchbox", { name: "Search users" })
        .fill(identity.userEmail);
      await page
        .getByRole("cell", { name: identity.userEmail, exact: true })
        .waitFor();
      await persisted();
      // Reload to discard client/query state and exercise persisted server reads.
      await page.reload();
      await page
        .getByRole("cell", { name: identity.userEmail, exact: true })
        .waitFor();
      const csv = await context.request.get(
        `${origin}/api/admin/users/export?search=${encodeURIComponent(identity.userEmail)}`
      );
      assert.equal(csv.status(), 200);
      assert.ok((await csv.text()).includes(identity.userEmail));
    });
    await step("Administrator signs out and loses server access", async () => {
      await page
        .getByRole("button", { name: new RegExp(`E2E Admin ${run}`, "u") })
        .click();
      await page
        .getByRole("menuitem", { name: "Sign out", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Admin sign in", exact: true })
        .waitFor();
      assert.equal(
        await (
          await context.request.get(`${origin}/api/auth/get-session`)
        ).json(),
        null
      );
      await deniedEndpoints(context, origin, 401, run);
    });
    await step(
      "Ordinary user authenticates but cannot access the admin panel",
      async () => {
        await signIn(page, origin, identity.userEmail, userPassword);
        await page
          .getByRole("heading", { name: "Access denied", exact: true })
          .waitFor();
        const session = await (
          await context.request.get(`${origin}/api/auth/get-session`)
        ).json();
        assert.equal(session.user.email, identity.userEmail);
        assert.equal(session.user.role, "user");
        await page.goto(`${origin}/admin/users`);
        await page
          .getByRole("heading", { name: "Access denied", exact: true })
          .waitFor();
        await deniedEndpoints(context, origin, 403, run);
        assert.equal(
          await page
            .getByRole("cell", { name: identity.adminEmail, exact: true })
            .count(),
          0
        );
      }
    );
    await step("No browser runtime errors", () => {
      assert.equal(runtimeErrors, 0);
      return Promise.resolve();
    });
  } finally {
    await context.close();
  }
}
