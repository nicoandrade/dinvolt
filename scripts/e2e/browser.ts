import assert from "node:assert/strict";

import type { Browser, BrowserContext, Page, Request } from "playwright";

import { checkAuthRedirects, observePanel } from "./auth-redirects.ts";
import { testIdentity } from "./config.ts";

async function signIn(
  page: Page,
  origin: string,
  email: string,
  password: string,
  login: string
) {
  await page.goto(`${origin}${login}`);
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
  step: (name: string, action: () => Promise<void>) => Promise<void>,
  standalone = false
) {
  const login = standalone ? "/" : "/admin";
  const home = standalone ? "/dashboard" : "/admin/home";
  const users = standalone ? "/users" : "/admin/users";
  const identity = testIdentity(run);
  const context = await browser.newContext();
  const panel = await observePanel(context);
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
      "Missing and invalid cookies redirect without rendering panel UI; auth routes stay public",
      () => checkAuthRedirects(browser, origin, standalone)
    );
    await step(
      "Login controls remain usable during a delayed session check",
      async () => {
        let release: (() => void) | undefined;
        // eslint-disable-next-line promise/avoid-new -- Hold a browser request until static UI assertions complete.
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let requests = 0;
        await page.route("**/api/auth/get-session*", async (route) => {
          requests += 1;
          await held;
          await route.continue();
        });
        try {
          const requested = page.waitForRequest(
            (request) =>
              new URL(request.url()).pathname === "/api/auth/get-session"
          );
          await page.goto(`${origin}${login}`, {
            waitUntil: "domcontentloaded",
          });
          await requested;
          assert.equal(
            await page
              .getByRole("link", { name: "Back to home", exact: true })
              .count(),
            standalone ? 0 : 1
          );
          await page
            .getByLabel("Email", { exact: true })
            .fill("static@example.com");
          assert.equal(
            await page
              .getByRole("button", { name: "Sign in", exact: true })
              .isVisible(),
            true
          );
        } finally {
          release?.();
        }
        await page.unrouteAll({ behavior: "wait" });
        assert.equal(
          requests,
          1,
          "The login should not duplicate session reads."
        );
      }
    );
    await step(
      "Anonymous access denied by pages and server endpoints",
      async () => {
        await page.goto(`${origin}${users}`);
        await page
          .getByRole("heading", { name: "Admin sign in", exact: true })
          .waitFor();
        assert.equal(new URL(page.url()).pathname, login);
        await deniedEndpoints(context, origin, 401, run);
      }
    );
    await step(
      "Administrator signs in through the generated form",
      async () => {
        await signIn(page, origin, identity.adminEmail, adminPassword, login);
        await page.waitForURL(`${origin}${home}`);
        const session = await (
          await context.request.get(`${origin}/api/auth/get-session`)
        ).json();
        assert.equal(session.user.email, identity.adminEmail);
        assert.equal(session.user.role, "admin");
        assert.equal(
          await page
            .getByRole("link", { name: "Visit website", exact: true })
            .count(),
          standalone ? 0 : 1
        );
        await page.goto(`${origin}${login}`);
        await page.waitForURL(`${origin}${home}`);
        const recovery = standalone
          ? "/forgot-password"
          : "/admin/forgot-password";
        assert.equal(
          (await context.request.get(`${origin}${recovery}`)).status(),
          200
        );
      }
    );
    await step(
      "User list keeps controls and rows usable during delayed reads",
      async () => {
        let sessionReads = 0;
        const countSessionReads = (request: Request) => {
          if (new URL(request.url()).pathname === "/api/auth/get-session") {
            sessionReads += 1;
          }
        };
        page.on("request", countSessionReads);
        let release: (() => void) | undefined;
        // eslint-disable-next-line promise/avoid-new -- Release intercepted data only after checking the visible UI.
        let held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let requests = 0;
        await page.route("**/api/trpc/admin.users*", async (route) => {
          requests += 1;
          await held;
          await route.continue();
        });
        try {
          const firstRead = page.waitForRequest((request) =>
            request.url().includes("/api/trpc/admin.users")
          );
          await page.goto(`${origin}${users}?search=${run}`, {
            waitUntil: "domcontentloaded",
          });
          await firstRead;
          await page
            .getByRole("heading", { name: "Users", exact: true })
            .waitFor();
          assert.equal(
            await page
              .getByRole("searchbox", { name: "Search users" })
              .isEnabled(),
            true
          );
          assert.equal(
            await page
              .getByRole("button", { name: "Create user", exact: true })
              .isEnabled(),
            true
          );
          assert.equal(
            await page.getByRole("columnheader", { name: /Name/u }).isVisible(),
            true
          );
          release?.();
          await page
            .getByRole("cell", { name: identity.adminEmail, exact: true })
            .waitFor();
          // eslint-disable-next-line promise/avoid-new -- Hold the next query to verify that existing rows survive a parameter change.
          held = new Promise<void>((resolve) => {
            release = resolve;
          });
          const nextRead = page.waitForRequest((request) =>
            request.url().includes("/api/trpc/admin.users")
          );
          await page
            .getByRole("searchbox", { name: "Search users" })
            .fill(identity.adminEmail);
          await nextRead;
          assert.equal(
            await page
              .getByRole("cell", { name: identity.adminEmail, exact: true })
              .isVisible(),
            true
          );
          assert.equal(
            await page
              .getByRole("searchbox", { name: "Search users" })
              .inputValue(),
            identity.adminEmail
          );
          release?.();
          await page.waitForResponse(
            (response) =>
              response.url().includes("/api/trpc/admin.users") &&
              response.status() === 200
          );
          assert.equal(
            requests,
            2,
            "Initial and changed-query reads must each occur once."
          );
          assert.equal(
            sessionReads,
            0,
            "The panel must reuse server-verified identity."
          );
        } finally {
          release?.();
          await page.unrouteAll({ behavior: "wait" });
          page.off("request", countSessionReads);
        }
      }
    );
    await step("Create and list a user through the generated UI", async () => {
      await page.goto(`${origin}${users}`);
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
    await step(
      "User details, edits, settings tabs and mobile navigation use the app routes",
      async () => {
        const row = page.getByRole("row").filter({
          has: page.getByRole("cell", {
            name: identity.userEmail,
            exact: true,
          }),
        });
        await row.click();
        await page.waitForURL((url) => url.pathname.startsWith(`${users}/`));
        await page
          .getByRole("heading", { name: `E2E User ${run}`, exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Edit user", exact: true })
          .click();
        const sheet = page.getByRole("dialog");
        await sheet
          .getByLabel("Name", { exact: true })
          .fill(`E2E User ${run} Edited`);
        await sheet
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await page
          .getByText("User updated successfully.", { exact: true })
          .waitFor();
        await page.reload();
        await page
          .getByRole("heading", { name: `E2E User ${run} Edited`, exact: true })
          .waitFor();
        const settings = standalone ? "/settings" : "/admin/settings";
        await page.goto(`${origin}${settings}`);
        await page
          .getByRole("form", { name: "General settings", exact: true })
          .waitFor();
        await page
          .getByRole("link", { name: "Preferences", exact: true })
          .click();
        await page.waitForURL(`${origin}${settings}/preferences`);
        await page
          .getByRole("form", { name: "Preferences settings", exact: true })
          .waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
        await page
          .getByRole("button", { name: "Expand sidebar", exact: true })
          .click();
        await page.getByRole("link", { name: "Users", exact: true }).click();
        await page.waitForURL(`${origin}${users}`);
        await page
          .getByRole("heading", { name: "Users", exact: true })
          .waitFor();
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    );
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
      "Back and forward after sign-out do not render the panel",
      async () => {
        panel.start();
        await page.goBack();
        await page
          .getByRole("heading", { name: "Admin sign in", exact: true })
          .waitFor();
        await page.waitForLoadState("networkidle");
        await page.goBack();
        await page
          .getByRole("heading", { name: "Admin sign in", exact: true })
          .waitFor();
        await page.waitForLoadState("networkidle");
        await page.goForward();
        await page
          .getByRole("heading", { name: "Admin sign in", exact: true })
          .waitFor();
        await page.waitForLoadState("networkidle");
        panel.assertHidden();
      }
    );
    await step(
      "Ordinary user authenticates but cannot access the admin panel",
      async () => {
        await signIn(page, origin, identity.userEmail, userPassword, login);
        await page
          .getByRole("heading", { name: "Access denied", exact: true })
          .waitFor();
        const session = await (
          await context.request.get(`${origin}/api/auth/get-session`)
        ).json();
        assert.equal(session.user.email, identity.userEmail);
        assert.equal(session.user.role, "user");
        panel.start();
        await page.goto(`${origin}${users}`);
        await page
          .getByRole("heading", { name: "Access denied", exact: true })
          .waitFor();
        await deniedEndpoints(context, origin, 403, run);
        await page.waitForLoadState("networkidle");
        panel.assertHidden();
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
