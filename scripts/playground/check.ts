import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";
import type { Page } from "playwright";
import sharp from "sharp";

import { loadUIComponentCatalog } from "../../src/ui-catalog.ts";
import { checkActionButtons } from "./check-action-buttons.ts";
import { checkCopyButton } from "./check-copy-button.ts";
import { checkDeleteButtons } from "./check-delete-buttons.ts";
import { checkGallery } from "./check-gallery.ts";
import { checkSettings } from "./check-settings.ts";
import { checkUserDetails } from "./check-user-details.ts";
import { repository } from "./sync.ts";

const origin = "http://localhost:3100";
const includeCatalog = process.argv.includes("--catalog");
const args = process.argv.slice(2).filter((arg) => arg !== "--catalog");
if (
  args.length &&
  (args.length !== 2 ||
    args[0] !== "--reference" ||
    !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/u.test(args[1] ?? ""))
) {
  throw new Error(
    "Usage: bun run playground:test [--catalog] [--reference http://localhost:3101]"
  );
}
const reference = args[1] ?? origin;
const output = join(repository, "demos/playground-checks");
await mkdir(output, { recursive: true });
let server: ReturnType<typeof spawn> | undefined;
let serverOutput = "";
const available = async () => {
  try {
    return (
      await (
        await fetch(`${origin}/playground`, {
          signal: AbortSignal.timeout(1500),
        })
      ).text()
    ).includes("Dinvolt Playground");
  } catch {
    return false;
  }
};
if (!(await available())) {
  server = spawn(process.execPath, ["run", "scripts/playground.ts"], {
    cwd: repository,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk: Buffer) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-5000);
  };
  server.stdout?.on("data", capture);
  server.stderr?.on("data", capture);
  const deadline = Date.now() + 180_000;
  while (!(await available())) {
    if (server.exitCode !== null || Date.now() > deadline) {
      server.kill("SIGTERM");
      throw new Error(`Playground did not start.\n${serverOutput}`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
  }
}

const browser = await chromium.launch().catch((error) => {
  server?.kill("SIGTERM");
  throw error;
});
const errors: string[] = [];
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
context.on("page", (page) =>
  page.on("pageerror", (error) =>
    errors.push(`${page.url()}: ${error.message}`)
  )
);
const page = await context.newPage();
const ready = async (previewPage: Page) => {
  await previewPage
    .getByRole("heading", { name: "Admin sign in", exact: true })
    .waitFor();
  if (new URL(previewPage.url()).pathname.startsWith("/preview/")) {
    await previewPage.locator('[data-preview-ready="true"]').waitFor();
  }
  await previewPage.evaluate(() => document.fonts.ready);
  await previewPage
    .locator("main img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode()))
    );
};
const fill = async () => {
  await page.getByLabel("Email", { exact: true }).fill("preview@example.com");
  await page.getByLabel("Password", { exact: true }).fill("preview-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
};

try {
  await checkGallery(browser, origin);
  await checkUserDetails(browser, origin, output);
  await checkCopyButton(browser, origin);
  await checkSettings(browser, origin, output);
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  try {
    const staticPage = await staticContext.newPage();
    await staticPage.goto(`${origin}/admin`);
    assert.equal(
      await staticPage.getByLabel("Email", { exact: true }).count(),
      1
    );
    assert.equal(
      await staticPage.getByLabel("Password", { exact: true }).count(),
      1
    );
    assert.equal(await staticPage.locator('[data-slot="skeleton"]').count(), 0);
    const sessionResponse = await staticContext.request.get(
      `${origin}/api/auth/get-session`
    );
    assert.equal(sessionResponse.status(), 200);
    assert.equal(await sessionResponse.json(), null);
    assert.equal(
      sessionResponse.headers()["cache-control"],
      "private, no-store"
    );
    console.log(
      "PASS prerendered login without JavaScript and anonymous session fast path"
    );
  } finally {
    await staticContext.close();
  }

  const deferredContext = await browser.newContext({ serviceWorkers: "block" });
  const { promise: sessionReady, resolve: releaseSession } =
    Promise.withResolvers<undefined>();
  try {
    await deferredContext.route("**/api/auth/get-session**", async (route) => {
      await sessionReady;
      await route.fulfill({ json: null });
    });
    const deferredPage = await deferredContext.newPage();
    const sessionRequest = deferredPage.waitForRequest(
      "**/api/auth/get-session**"
    );
    await deferredPage.goto(`${origin}/admin`, {
      waitUntil: "domcontentloaded",
    });
    await sessionRequest;
    const email = deferredPage.getByLabel("Email", { exact: true });
    await email.fill("preserved@example.com");
    await email.evaluate((input: HTMLInputElement) => {
      input.dataset.loginProbe = "same-input";
    });
    assert.equal(
      await deferredPage.locator('[data-slot="skeleton"]').count(),
      0
    );
    assert.equal(
      await deferredPage
        .getByRole("button", { name: "Sign in", exact: true })
        .isEnabled(),
      true
    );
    releaseSession();
    await deferredPage.waitForLoadState("networkidle");
    assert.equal(await email.inputValue(), "preserved@example.com");
    assert.equal(await email.getAttribute("data-login-probe"), "same-input");
    console.log(
      "PASS delayed session keeps the login usable and preserves its input instance"
    );
  } finally {
    releaseSession();
    await deferredContext.close();
  }

  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ] as const) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize(size);
      // Fresh pages select the same responsive image size; a reused desktop
      // preview can retain its larger cached image after switching to mobile.
      const previewPage = await context.newPage();
      await previewPage.setViewportSize(size);
      const actual = await context.newPage();
      await actual.setViewportSize(size);
      await previewPage.goto(`${origin}/preview/login?theme=${theme}`);
      await actual.goto(`${reference}/admin`);
      await ready(previewPage);
      await ready(actual);
      await actual.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark"
      );
      assert.equal(
        await previewPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true,
        "Preview overflows horizontally"
      );
      const options = {
        animations: "disabled" as const,
        caret: "hide" as const,
        // Normalize only the internal wrapper while capturing: display:contents
        // changes Chromium's rounded-border rasterization under backdrop blur.
        // The login's layout and styles remain intact, with exact pixel equality.
        style:
          "nextjs-portal { visibility: hidden !important; } [data-preview-ready] { display: block !important; }",
      };
      const preview = await previewPage.locator("main").screenshot(options);
      const generated = await actual.locator("main").screenshot(options);
      await writeFile(
        join(output, `preview-${size.width}-${theme}.png`),
        preview
      );
      await writeFile(
        join(output, `generated-${size.width}-${theme}.png`),
        generated
      );
      assert.deepEqual(
        await sharp(preview).raw().toBuffer(),
        await sharp(generated).raw().toBuffer(),
        `Visual mismatch at ${size.width}px / ${theme}`
      );
      console.log(`PASS pixel equality: ${size.width}px / ${theme}`);
      await previewPage.close();
      await actual.close();
    }
  }

  let realAuthResponses = 0;
  let mockedAuthResponses = 0;
  page.on("response", (response) => {
    if (
      /^\/api\/(?:auth\/|trpc\/admin\.users|admin\/users\/export)/u.test(
        new URL(response.url()).pathname
      )
    ) {
      if (response.fromServiceWorker()) {
        mockedAuthResponses += 1;
      } else {
        realAuthResponses += 1;
      }
    }
  });
  for (const [scenario, message] of [
    ["credentials", "Unable to sign in. Check your credentials and try again."],
    ["network", "Unable to connect. Please try again."],
  ] as const) {
    await page.goto(`${origin}/preview/login?scenario=${scenario}`);
    await ready(page);
    await fill();
    await page.getByText(message, { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Sign in", exact: true })
        .isEnabled(),
      true
    );
    console.log(`PASS ${scenario} error and retry`);
  }
  await page.goto(`${origin}/preview/login?scenario=invalid`);
  await ready(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Email", { exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
    true
  );
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.noValidate = true;
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByText("Enter a valid email address.", { exact: true })
    .waitFor();
  await page.getByText("Enter your password.", { exact: true }).waitFor();
  console.log("PASS native and schema validation");

  await page.goto(`${origin}/preview/login?scenario=pending`);
  await ready(page);
  const loginButtonLayout = await page
    .getByRole("button", { name: "Sign in", exact: true })
    .boundingBox();
  const loginEmail = await page
    .getByLabel("Email", { exact: true })
    .elementHandle();
  await fill();
  const signingIn = page.getByRole("button", {
    name: "Signing in…",
    exact: true,
  });
  assert.equal(await signingIn.isDisabled(), true);
  const signingInElement = await signingIn.elementHandle();
  assert.ok(signingInElement);
  await page.waitForFunction(
    (button) =>
      button.querySelector(".t-text-swap")?.textContent === "Signing in…",
    signingInElement
  );
  assert.equal(await signingIn.getAttribute("aria-busy"), "true");
  assert.deepEqual(await signingIn.boundingBox(), loginButtonLayout);
  assert.equal(await signingIn.locator('[data-slot="spinner"]').count(), 1);
  await page.waitForFunction((button) => {
    const spinner = button.querySelector('[data-icon="b"]');
    const reveal = button.querySelector(".t-action-spinner");
    return (
      spinner &&
      getComputedStyle(spinner).opacity === "1" &&
      reveal?.getBoundingClientRect().width === 16
    );
  }, signingInElement);
  assert.deepEqual(await signingIn.boundingBox(), loginButtonLayout);
  assert.equal(await loginEmail?.evaluate((node) => node.isConnected), true);
  assert.equal(await page.locator("form").getAttribute("aria-busy"), "true");
  console.log("PASS login action label, stable layout and pending submission");

  await page.goto(`${origin}/preview/login?scenario=denied`);
  await page.getByRole("heading", { name: "Access denied" }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByText("Unable to sign out. Please try again.", { exact: true })
    .waitFor();
  for (const scenario of ["network", "pending"]) {
    await page.goto(`${origin}/preview/sign-out?scenario=${scenario}`);
    await page.locator('[data-preview-ready="true"]').waitFor();
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    const layout = await signOut.boundingBox();
    await signOut.click();
    if (scenario === "network") {
      await page
        .getByRole("alert")
        .filter({ hasText: "Unable to sign out" })
        .waitFor();
      assert.equal(await signOut.isEnabled(), true);
      assert.equal(await signOut.getAttribute("aria-busy"), "false");
      await signOut.click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Unable to sign out" })
        .waitFor();
    } else {
      const signingOut = page.getByRole("button", {
        name: "Signing out…",
        exact: true,
      });
      assert.equal(await signingOut.isDisabled(), true);
      assert.equal(await signingOut.getAttribute("aria-busy"), "true");
      await page.waitForFunction(() => {
        const icon = document.querySelector('button [data-icon="b"]');
        return (
          icon &&
          getComputedStyle(icon).opacity === "1" &&
          document.querySelector("button .t-text-swap")?.textContent ===
            "Signing out…"
        );
      });
      assert.deepEqual(await signingOut.boundingBox(), layout);
      assert.equal(
        await signingOut.locator('[data-slot="spinner"]').count(),
        1
      );
    }
  }
  console.log(
    "PASS standalone sign-out pending label, Spinner, stable layout and error retry"
  );
  await page.goto(`${origin}/preview/login`);
  await ready(page);
  assert.equal(await page.locator('[data-slot="skeleton"]').count(), 0);
  assert.equal(await page.getByText("Loading", { exact: false }).count(), 0);
  assert.equal(
    realAuthResponses,
    0,
    "Preview reached the real authentication API"
  );
  assert.ok(mockedAuthResponses >= 2, "Preview responses were not intercepted");
  console.log("PASS denied, logout error, immediate login and mock isolation");

  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/preview/home?theme=${theme}`);
      await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true,
        "Home overflows horizontally"
      );
      await page
        .getByRole("button", {
          name: /^(?:Toggle Sidebar|Collapse sidebar|Expand sidebar)$/u,
        })
        .click();
      if (size.width < 768) {
        await page
          .getByRole("navigation", { name: "Admin navigation" })
          .waitFor();
        await page.keyboard.press("Escape");
      } else {
        await page
          .locator('[data-state="collapsed"][data-slot="sidebar"]')
          .waitFor();
        await page
          .getByRole("button", {
            name: /^(?:Toggle Sidebar|Collapse sidebar|Expand sidebar)$/u,
          })
          .click();
      }
      await page.screenshot({
        path: join(output, `home-${size.width}-${theme}.png`),
      });
      console.log(`PASS Home navigation: ${size.width}px / ${theme}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const scenario of ["network", "pending"]) {
    await page.goto(`${origin}/preview/home?scenario=${scenario}`);
    await page
      .getByRole("button", { name: "AM Alex Morgan alex@example.com" })
      .click();
    const menuSignOut = page.getByRole("menuitem", {
      name: "Sign out",
      exact: true,
    });
    await menuSignOut.hover();
    const menuActionLayout = await menuSignOut.boundingBox();
    const menuLabelLayout = await menuSignOut
      .locator(".t-text-swap")
      .boundingBox();
    await menuSignOut.click();
    if (scenario === "network") {
      await page
        .getByRole("alert")
        .filter({ hasText: "Unable to sign out" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Sign out", exact: true })
          .isEnabled(),
        true
      );
    } else {
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Signing out…", exact: true })
          .getAttribute("aria-busy"),
        "true"
      );
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Signing out…", exact: true })
          .isDisabled(),
        true
      );
      await page.waitForFunction(() => {
        const item = document.querySelector(
          '[role="menuitem"][aria-busy="true"]'
        );
        const icon = item?.querySelector('[data-icon="b"]');
        return (
          icon &&
          getComputedStyle(icon).opacity === "1" &&
          item?.querySelector(".t-text-swap")?.textContent === "Signing out…"
        );
      });
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Signing out…", exact: true })
          .locator("button")
          .count(),
        0
      );
      const pendingMenuAction = page.getByRole("menuitem", {
        name: "Signing out…",
        exact: true,
      });
      assert.deepEqual(await pendingMenuAction.boundingBox(), menuActionLayout);
      assert.equal(
        (await pendingMenuAction.locator(".t-text-swap").boundingBox())?.x,
        menuLabelLayout?.x
      );
    }
  }
  await page.goto(`${origin}/preview/home?scenario=skeleton`);
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  assert.equal(
    await page.locator("#home-title [data-slot=skeleton]").count(),
    0
  );
  assert.equal(await page.getByText("alex@example.com").count(), 0);
  console.log("PASS Home skeleton, logout error and pending state");

  await page.clock.install();
  await page.goto(`${origin}/preview/users`);
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  const usersTable = page.getByRole("table", { name: "Users", exact: true });
  assert.equal(
    await page.getByRole("button", { name: /refresh|reload|sync/iu }).count(),
    0,
    "Query-backed users must not expose a manual refresh control"
  );
  assert.equal(await usersTable.locator("tbody tr").count(), 10);
  const downloadUsers = async (count: number) => {
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const file = await downloaded;
    assert.match(file.suggestedFilename(), /^users.*\.csv$/u);
    const path = join(output, `users-export-${count}.csv`);
    await file.saveAs(path);
    const csv = await readFile(path, "utf-8");
    assert.ok(csv.startsWith('\uFEFF"ID";"Name";"Email";'));
    assert.equal(csv.trimEnd().split("\r\n").length, count + 1);
    return csv;
  };
  await downloadUsers(27);

  await page
    .getByRole("button", { name: "Go to next page", exact: true })
    .click();
  await page.getByText("11–20 of 27 users", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  await usersTable
    .locator("tbody tr")
    .first()
    .getByText("user01@example.com", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("columnheader", { name: "Email", exact: true })
      .getAttribute("aria-sort"),
    "ascending"
  );
  await page
    .getByRole("searchbox", { name: "Search users" })
    .fill("user01@example.com");
  await page.getByText("1–1 of 1 users", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  const roleFilter = page.getByRole("combobox", { name: "Filter by role" });
  await roleFilter.click();
  await page.getByRole("option", { name: "Admin", exact: true }).click();
  await page.getByText("1–4 of 4 users", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("role"), "admin");
  const usersSearch = page.getByRole("searchbox", { name: "Search users" });
  await usersSearch.fill("Alex Morgan");
  await page.getByText("1–1 of 1 users", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("search"), "Alex Morgan");
  const filteredCsv = await downloadUsers(1);
  assert.ok(filteredCsv.includes('"Alex Morgan";"user01@example.com";"admin"'));

  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByText("1–4 of 4 users", { exact: true }).waitFor();
  await roleFilter.click();
  await page.getByRole("option", { name: "User", exact: true }).click();
  await page.getByText("1–10 of 23 users", { exact: true }).waitFor();
  await roleFilter.click();
  await page.getByRole("option", { name: "All roles", exact: true }).click();
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  const beforeBack = mockedAuthResponses;
  await page.goBack();
  await page.getByText("1–10 of 23 users", { exact: true }).waitFor();
  assert.match((await roleFilter.textContent()) ?? "", /^User/u);
  assert.equal(
    mockedAuthResponses,
    beforeBack,
    "Back should reuse fresh table data"
  );
  await page.goForward();
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  await usersSearch.fill("preview-user-27");
  await page.getByText("1–1 of 1 users", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Rows per page" })
    .selectOption("20");
  await page.getByText("1–20 of 27 users", { exact: true }).waitFor();
  assert.equal(await usersTable.locator("tbody tr").count(), 20);
  await page
    .getByRole("button", { name: "Go to next page", exact: true })
    .click();
  await page.getByText("21–27 of 27 users", { exact: true }).waitFor();
  await downloadUsers(27);
  console.log(
    "PASS CSV exports all matching users from another page and preserves combined search/role filters"
  );

  assert.equal(
    realAuthResponses,
    0,
    "Users preview reached the real Better Auth API"
  );
  console.log(
    "PASS Users URL search (name/email/ID), roles, Back/Forward cache, sorting, pagination and preview isolation"
  );
  await checkActionButtons(page, origin, output);
  await checkDeleteButtons(page, origin, output);
  await checkActionButtons(page, origin, output, "public");
  await checkDeleteButtons(page, origin, output, "public");
  await page.goto(`${origin}/preview/users?delay=500`);
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((visibility) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => visibility,
      });
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    }, state);
  const freshResponses = mockedAuthResponses;
  await setVisibility("hidden");
  await setVisibility("visible");
  await page.waitForTimeout(100);
  assert.equal(
    mockedAuthResponses,
    freshResponses,
    "Fresh data must not refetch on focus"
  );
  await setVisibility("hidden");
  await page.clock.fastForward(61_000);
  assert.equal(
    mockedAuthResponses,
    freshResponses,
    "Freshness expiration alone must not poll"
  );
  const tableLayout = await usersTable.boundingBox();
  const firstUserRow = await usersTable
    .locator("tbody tr")
    .first()
    .elementHandle();
  const refocused = page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/api/trpc/admin.users")
  );
  await setVisibility("visible");
  await page
    .locator('[aria-busy="true"]')
    .getByRole("table", { name: "Users", exact: true })
    .waitFor();
  assert.equal(await usersTable.locator("tbody tr").count(), 10);
  assert.deepEqual(
    await usersTable.boundingBox(),
    tableLayout,
    "Background refetch must preserve table layout"
  );
  assert.equal(
    await page.getByRole("status", { name: "Fetching users" }).count(),
    0
  );
  assert.equal(
    await page
      .locator(
        '[aria-labelledby="users-title"] [data-slot="skeleton"], [aria-labelledby="users-title"] .t-icon-swap[data-state="b"] [data-slot="spinner"], [aria-labelledby="users-title"] [data-slot="spinner"]:not(.t-icon-swap *)'
      )
      .count(),
    0
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Go to next page", exact: true })
      .isDisabled(),
    false,
    "Background refetch must not disable valid pagination"
  );
  await refocused;
  await page
    .locator('[aria-busy="false"]')
    .getByRole("table", { name: "Users", exact: true })
    .waitFor();
  assert.equal(mockedAuthResponses, freshResponses + 1);
  assert.equal(
    await firstUserRow?.evaluate((row) => row.isConnected),
    true,
    "Background refetch must preserve existing row nodes"
  );
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.clock.fastForward(61_000);
  const reconnected = page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/api/trpc/admin.users")
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await reconnected;
  await page
    .locator('[aria-busy="false"]')
    .getByRole("table", { name: "Users", exact: true })
    .waitFor();
  assert.equal(mockedAuthResponses, freshResponses + 2);
  assert.equal(
    realAuthResponses,
    0,
    "Background preview refresh reached the real API"
  );
  console.log(
    "PASS Users fresh-cache focus reuse, stale focus/reconnect refresh and silent stable-layout updates"
  );
  for (const size of [
    { width: 1280, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/preview/users?theme=${theme}`);
      await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true,
        "Users page overflows horizontally"
      );
      await page.screenshot({
        path: join(output, `users-${size.width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto(`${origin}/preview/users?scenario=empty`);
  await page.getByText("No users found.", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Go to next page", exact: true })
      .isDisabled(),
    true
  );
  await page.goto(`${origin}/preview/users?scenario=network`);
  await page
    .getByRole("alert")
    .filter({ hasText: "Unable to fetch users" })
    .waitFor();
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Unable to export CSV" })
    .waitFor();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Unable to fetch users" })
    .waitFor();
  await page.goto(`${origin}/preview/users?scenario=pending`);
  await page
    .getByRole("status", { name: "Fetching users" })
    .waitFor({ state: "attached" });
  await page.getByRole("heading", { name: "Users", exact: true }).waitFor();
  await page
    .getByText("View and manage the users in your application.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("searchbox", { name: "Search users" })
    .fill("Still usable");
  assert.equal(
    await page.getByRole("combobox", { name: "Filter by role" }).isEnabled(),
    true
  );
  assert.equal(
    await page.getByRole("combobox", { name: "Rows per page" }).isEnabled(),
    true
  );
  assert.equal(
    await usersTable.locator("thead [data-slot=skeleton]").count(),
    0
  );
  assert.equal(await usersTable.getByRole("columnheader").count(), 6);
  assert.ok(
    (await usersTable.locator("tbody [data-slot=skeleton]").count()) > 0
  );
  const searchNode = await page
    .getByRole("searchbox", { name: "Search users" })
    .elementHandle();
  await page.getByRole("button", { name: "Name", exact: true }).click();
  assert.equal(await searchNode?.evaluate((node) => node.isConnected), true);
  assert.equal(await page.getByText("Loading", { exact: false }).count(), 0);
  console.log(
    "PASS Users themes, responsive layout, empty, retry and initial skeleton states"
  );

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${origin}/playground`);
  await page.getByRole("button", { name: "Login page", exact: true }).click();
  const frame = page.frameLocator("iframe");
  await frame
    .getByRole("heading", { name: "Admin sign in", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Mobile viewport", exact: true })
    .click();
  assert.equal(
    await page
      .locator("iframe")
      .evaluate((element) => element.getBoundingClientRect().width),
    390
  );
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await frame.locator("html.dark").waitFor();
  await page
    .getByRole("combobox", { name: "State", exact: true })
    .selectOption("denied");
  await frame.getByRole("heading", { name: "Access denied" }).waitFor();
  await page.getByRole("button", { name: "Login form", exact: true }).click();
  await frame
    .getByRole("heading", { name: "Admin sign in", exact: true })
    .waitFor();
  await frame.getByLabel("Email", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "gallery.png"), fullPage: true });
  await page.goto(`${origin}/playground?section=action-button`);
  // Navigation prerenders before the browser URL is hydrated.
  await page
    .getByRole("button", { name: "Action button", exact: true })
    .and(page.locator('[aria-current="page"]'))
    .waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page
      .getByRole("button", { name: "Action button", exact: true })
      .getAttribute("aria-current"),
    "page"
  );
  const loginAction = frame.getByRole("region", {
    name: "Login action",
    exact: true,
  });
  await loginAction
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  assert.equal(
    await loginAction
      .getByRole("button", { name: "Signing in…", exact: true })
      .isDisabled(),
    true
  );
  await page.goto(`${origin}/playground?section=users`);
  await frame.getByText("1–10 of 27 users", { exact: true }).waitFor();
  const galleryExport = frame.getByRole("button", {
    name: "Export CSV",
    exact: true,
  });
  const galleryExportLayout = await galleryExport.boundingBox();
  const galleryDownload = page.waitForEvent("download");
  await galleryExport.click();
  const usersPreview = page
    .frames()
    .find((preview) => new URL(preview.url()).pathname === "/preview/users");
  assert.ok(usersPreview);
  await usersPreview.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Exporting…"]');
    const text = button?.querySelector(".t-text-swap");
    const spinner = button?.querySelector('[data-icon="b"]');
    return (
      text?.textContent === "Exporting…" &&
      getComputedStyle(text).opacity === "1" &&
      spinner &&
      getComputedStyle(spinner).opacity === "1"
    );
  });
  const galleryExporting = frame.getByRole("button", {
    name: "Exporting…",
    exact: true,
  });
  assert.equal(await galleryExporting.isDisabled(), true);
  assert.deepEqual(await galleryExporting.boundingBox(), galleryExportLayout);
  assert.equal(
    await frame
      .getByRole("table", { name: "Users", exact: true })
      .locator("tbody tr")
      .count(),
    10
  );
  assert.equal(
    (await galleryDownload).suggestedFilename(),
    "users-preview.csv"
  );
  await galleryExport.waitFor();
  assert.equal(await galleryExport.isEnabled(), true);
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(
    "PASS gallery navigation, viewport, theme and Action button deep link with login example"
  );
  if (includeCatalog) {
    for (const area of ["admin", "public"] as const) {
      const prefix =
        area === "admin" ? "/preview/catalog/" : "/public-preview/";
      const catalog = await loadUIComponentCatalog(area);
      const names = catalog.items
        .filter((item) => item.type === "registry:ui")
        .map((item) => item.name);
      await page.goto(`${origin}${prefix}showcase`);
      await page
        .getByText(area === "admin" ? "Vega - Inter" : "Luma - Inter", {
          exact: true,
        })
        .waitFor();
      assert.equal(await page.locator("html").getAttribute("data-ui"), area);
      await page.screenshot({ path: join(output, `${area}-showcase.png`) });
      for (const name of names) {
        await page.goto(`${origin}${prefix}${name}`, {
          waitUntil: "domcontentloaded",
        });
        await page
          .locator('main [data-slot]:not([data-slot="skeleton"])')
          .first()
          .waitFor();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve())
              );
            })
        );
        assert.deepEqual(
          errors,
          [],
          `${area} / ${name}: browser runtime errors`
        );
      }
      await page.goto(`${origin}${prefix}dialog?theme=dark`);
      await page.locator("html.dark").waitFor();
      await page
        .getByRole("button", { name: "Edit Profile", exact: true })
        .first()
        .click();
      await page.getByRole("dialog").waitFor();
      assert.equal(await page.locator("html").getAttribute("data-ui"), area);
      assert.notEqual(
        await page
          .getByRole("dialog")
          .evaluate((element) => getComputedStyle(element).backgroundColor),
        "rgba(0, 0, 0, 0)"
      );
      await page.goto(`${origin}${prefix}questionnaire`);
      await page.getByRole("radio", { name: "Team", exact: true }).click();
      assert.equal(
        await page
          .getByRole("radio", { name: "Team", exact: true })
          .isChecked(),
        true
      );
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      console.log(
        `PASS ${area}: showcase, all ${names.length} component examples, dialog and questionnaire interactions`
      );
    }
    assert.deepEqual(errors, [], "Catalog browser runtime errors");
  }
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
