import assert from "node:assert/strict";
import { join } from "node:path";

import type { Browser } from "playwright";

export const checkUserDetails = async (
  browser: Browser,
  origin: string,
  output: string
) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const breadcrumb = page.getByRole("navigation", {
    name: "breadcrumb",
    exact: true,
  });
  let reads = 0;
  let sessions = 0;
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    const detailReads = path
      .slice("/api/trpc/".length)
      .split(",")
      .filter((procedure) => procedure === "admin.user").length;
    if (detailReads) {
      reads += detailReads;
      assert.ok(
        response.fromServiceWorker(),
        "Detail preview reached the real API"
      );
    }
    if (path === "/api/auth/get-session") {
      sessions += 1;
    }
  });
  try {
    await page.goto(`${origin}/preview/users`);
    const table = page.getByRole("table", { name: "Users", exact: true });
    const row = table.locator("tbody tr").first();
    const link = row.getByRole("link");
    await link.waitFor();
    const name = await link.textContent();
    assert.ok(name);
    const email = await row.locator("td").nth(1).textContent();
    // Click the last cell to verify the entire row is a native navigable link.
    const bounds = await row.locator("td").last().boundingBox();
    assert.ok(bounds);
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
    await page.getByRole("heading", { level: 1, name, exact: true }).waitFor();
    await breadcrumb.getByRole("link", { name, exact: true }).waitFor();
    assert.equal(
      await breadcrumb
        .getByRole("link", { name: "Users", exact: true })
        .getAttribute("href"),
      "/preview/users"
    );
    assert.equal(
      await breadcrumb
        .getByRole("link", { name, exact: true })
        .getAttribute("aria-current"),
      "page"
    );
    assert.match(page.url(), /\/preview\/user\?userId=/u);
    assert.equal(
      await page
        .getByRole("button", { name: "Copy email", exact: true })
        .locator("span")
        .first()
        .textContent(),
      email
    );
    assert.equal(reads, 1);
    assert.equal(sessions, 0);
    await page.getByRole("button", { name: "Edit user", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill("user01@example.com");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page
      .getByText("A user with this email already exists.", { exact: true })
      .waitFor();
    await page.getByLabel("Name", { exact: true }).fill("Updated preview user");
    await page
      .getByLabel("Email", { exact: true })
      .fill("updated-preview@example.com");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page
      .getByRole("heading", {
        level: 1,
        name: "Updated preview user",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Copy email", exact: true })
        .locator("span")
        .first()
        .textContent(),
      "updated-preview@example.com"
    );
    await breadcrumb
      .getByRole("link", { name: "Updated preview user", exact: true })
      .waitFor();
    assert.equal(reads, 2, "Editing should invalidate the detail exactly once");
    await page
      .locator('section[aria-labelledby="user-title"]')
      .getByRole("link", { name: "Users", exact: true })
      .click();
    await table
      .getByRole("link", { name: "Updated preview user", exact: true })
      .waitFor();
    assert.equal(
      await breadcrumb
        .getByRole("link", { name: "Updated preview user", exact: true })
        .count(),
      0
    );
    const otherUser = table.locator("tbody tr").nth(1).getByRole("link");
    const otherName = await otherUser.textContent();
    assert.ok(otherName);
    await otherUser.click();
    await breadcrumb
      .getByRole("link", { name: otherName, exact: true })
      .waitFor();
    assert.equal(
      await breadcrumb
        .getByRole("link", { name: "Updated preview user", exact: true })
        .count(),
      0
    );
    assert.equal(reads, 3);
    await breadcrumb.getByRole("link", { name: "Users", exact: true }).click();
    await table
      .getByRole("link", { name: "Updated preview user", exact: true })
      .click();
    await breadcrumb
      .getByRole("link", { name: "Updated preview user", exact: true })
      .waitFor();
    assert.equal(
      reads,
      3,
      "Returning to a fresh cached detail must not fetch again for the breadcrumb"
    );

    await page.goto(`${origin}/preview/user?scenario=pending`);
    await page.locator('[data-preview-ready="true"]').waitFor();
    assert.equal(
      await page
        .locator('section[aria-labelledby="user-title"]')
        .getByRole("link", { name: "Users", exact: true })
        .isVisible(),
      true
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Edit user", exact: true })
        .isDisabled(),
      true
    );
    assert.equal(await page.locator("dt").count(), 7);
    assert.equal(await page.locator("dd [data-slot=skeleton]").count(), 7);
    assert.equal(await breadcrumb.locator("[data-slot=skeleton]").count(), 1);
    assert.equal(
      await breadcrumb
        .getByRole("link", { name: "Users", exact: true })
        .getAttribute("href"),
      "/preview/users"
    );
    assert.equal(await page.getByText("Loading", { exact: false }).count(), 0);

    await page.goto(`${origin}/preview/user?scenario=missing`);
    await page
      .getByRole("heading", { name: "User not found", exact: true })
      .waitFor();
    await breadcrumb
      .getByRole("link", { name: "User not found", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Edit user", exact: true })
        .isDisabled(),
      true
    );
    await page.goto(`${origin}/preview/user?scenario=network`);
    await page
      .getByRole("alert")
      .filter({ hasText: "Unable to fetch the user" })
      .waitFor();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Unable to fetch the user" })
      .waitFor();

    await page.clock.install();
    await page.goto(`${origin}/preview/user?delay=1000`);
    await page.locator("dd [data-slot=skeleton]").first().waitFor();
    const label = await page.locator("dt").first().elementHandle();
    const trigger = await page
      .getByRole("button", { name: "Edit user", exact: true })
      .elementHandle();
    const breadcrumbParent = await breadcrumb
      .getByRole("link", { name: "Users", exact: true })
      .elementHandle();
    await page
      .getByRole("heading", { name: "Jordan Lee", exact: true })
      .waitFor();
    assert.equal(await label?.evaluate((node) => node.isConnected), true);
    assert.equal(await trigger?.evaluate((node) => node.isConnected), true);
    assert.equal(
      await breadcrumbParent?.evaluate((node) => node.isConnected),
      true
    );
    await breadcrumb
      .getByRole("link", { name: "Jordan Lee", exact: true })
      .waitFor();
    const freshReads = reads;
    const setVisibility = (visibility: "hidden" | "visible") =>
      page.evaluate((value) => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => value,
        });
        document.dispatchEvent(
          new Event("visibilitychange", { bubbles: true })
        );
      }, visibility);
    await setVisibility("hidden");
    await page.clock.fastForward(61_000);
    const refreshed = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/trpc/admin.user"
    );
    await setVisibility("visible");
    assert.equal(
      await breadcrumb
        .getByRole("link", { name: "Jordan Lee", exact: true })
        .isVisible(),
      true
    );
    assert.equal(await page.locator("[data-slot=skeleton]").count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "Edit user", exact: true })
        .isEnabled(),
      true
    );
    await refreshed;
    assert.equal(reads, freshReads + 1);
    assert.equal(sessions, 0);

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.goto(`${origin}/preview/user?theme=${theme}`);
        await page
          .getByRole("heading", { name: "Jordan Lee", exact: true })
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        );
        await page.screenshot({
          path: join(output, `user-detail-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    console.log(
      "PASS User details and breadcrumb: single shared read, rename, route changes, cache reuse, static loading, silent refresh and responsive themes"
    );
  } finally {
    await context.close();
  }
};
