import assert from "node:assert/strict";

import type { Browser } from "playwright";

export async function checkGallery(browser: Browser, origin: string) {
  const path =
    "/playground?section=login&scenario=invalid&theme=dark&viewport=390";
  const preview = "/preview/login?scenario=invalid&theme=dark";
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await staticContext.newPage();
    await page.goto(`${origin}${path}`);
    assert.equal(
      await page.getByRole("link", { name: "Dinvolt Playground" }).count(),
      1
    );
    assert.equal(await page.getByLabel("Search components").count(), 1);
    assert.equal(
      await page.getByRole("combobox", { name: /^Profile/u }).count(),
      1
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Light theme", exact: true })
        .count(),
      1
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Login page", exact: true })
        .count(),
      1
    );
    assert.equal(await page.locator("iframe").count(), 0);
    assert.equal(await page.locator(".dv-canvas > .dv-placeholder").count(), 1);
  } finally {
    await staticContext.close();
  }

  const context = await browser.newContext({ serviceWorkers: "block" });
  const { promise: hydrated, resolve: releaseScripts } =
    Promise.withResolvers<undefined>();
  const errors: string[] = [];
  const previews: string[] = [];
  try {
    await context.route("**/_next/static/**/*.js", async (route) => {
      await hydrated;
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(15_000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        new URL(request.url()).pathname === "/preview/login"
      ) {
        previews.push(
          new URL(request.url()).pathname + new URL(request.url()).search
        );
      }
    });
    await page.goto(`${origin}${path}`, { waitUntil: "commit" });
    const search = page.getByLabel("Search components");
    await search.waitFor();
    const originalInput = await search.elementHandle();
    assert.ok(originalInput);
    assert.equal(await page.locator("iframe").count(), 0);
    releaseScripts();
    const frame = page.locator(`iframe[src="${preview}"]`);
    await frame.waitFor();
    await page
      .frameLocator(`iframe[src="${preview}"]`)
      .getByLabel("Email", { exact: true })
      .waitFor();
    assert.deepEqual(
      previews,
      [preview],
      "Hydration must request only the selected preview"
    );
    assert.equal(
      await search.evaluate(
        (input, original) => input === original,
        originalInput
      ),
      true
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Dark theme", exact: true })
        .getAttribute("aria-pressed"),
      "true"
    );
    assert.equal(
      await frame.evaluate((element) => element.style.width),
      "390px"
    );
    const originalFrame = await frame.elementHandle();
    assert.ok(originalFrame);
    await search.fill("Button");
    await page
      .getByRole("button", { name: "Action button", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Login page", exact: true })
        .count(),
      0
    );
    await page
      .getByRole("button", { name: "Tablet viewport", exact: true })
      .click();
    assert.equal(new URL(page.url()).searchParams.get("viewport"), "768");
    assert.equal(
      await frame.evaluate((element) => element.style.width),
      "768px"
    );
    assert.equal(
      await frame.evaluate(
        (element, original) => element === original,
        originalFrame
      ),
      true,
      "Searching and resizing must preserve the mounted preview"
    );
    assert.deepEqual(
      previews,
      [preview],
      "Searching and resizing must not reload the preview"
    );
    await page
      .getByRole("button", { name: "Light theme", exact: true })
      .click();
    await page
      .locator('iframe[src="/preview/login?scenario=invalid&theme=light"]')
      .waitFor();
    await page.evaluate(() => window.history.back());
    await frame.waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Dark theme", exact: true })
        .getAttribute("aria-pressed"),
      "true"
    );
    await page.evaluate(() => window.history.forward());
    await page
      .locator('iframe[src="/preview/login?scenario=invalid&theme=light"]')
      .waitFor();
    assert.equal(await search.inputValue(), "Button");
    assert.equal(
      await search.evaluate(
        (input, original) => input === original,
        originalInput
      ),
      true
    );
    await page
      .getByRole("combobox", { name: /^Profile/u })
      .selectOption("public");
    await page
      .locator('iframe[src="/public-preview/showcase?theme=light"]')
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.get("profile"), "public");
    assert.equal(new URL(page.url()).searchParams.get("section"), null);
    assert.equal(new URL(page.url()).searchParams.get("scenario"), null);

    await page.setViewportSize({ width: 390, height: 844 });
    const openNavigation = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    await openNavigation.click();
    const navigation = page.getByRole("dialog", {
      name: "Browse components",
      exact: true,
    });
    await navigation.waitFor();
    const mobileSearch = navigation.getByLabel("Search components");
    await mobileSearch.fill("no-component-with-this-name");
    await navigation.getByText("No results found", { exact: true }).waitFor();
    await navigation
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    assert.equal(await mobileSearch.inputValue(), "");
    await navigation
      .getByRole("button", { name: "Action button", exact: true })
      .click();
    await navigation.waitFor({ state: "hidden" });
    await page
      .locator(
        'iframe[src="/public-preview/action-button?scenario=default&theme=light"]'
      )
      .waitFor();
    assert.equal(
      new URL(page.url()).searchParams.get("section"),
      "action-button"
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true,
      "The mobile gallery must not overflow the page"
    );
    await openNavigation.click();
    await navigation
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await navigation.waitFor({ state: "hidden" });
    assert.equal(
      await openNavigation.evaluate(
        (element) => element === document.activeElement
      ),
      true
    );
    await openNavigation.click();
    const navigationElement = await navigation.elementHandle();
    assert.ok(navigationElement);
    await page.waitForFunction(
      (element) => element.contains(document.activeElement),
      navigationElement
    );
    await navigation
      .getByRole("button", { name: "Close", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await page.waitForFunction(
      (element) => element.contains(document.activeElement),
      navigationElement
    );
    await page.keyboard.press("Escape");
    await navigation.waitFor({ state: "hidden" });
    assert.equal(
      await openNavigation.evaluate(
        (element) => element === document.activeElement
      ),
      true,
      "Escape must close navigation and return focus to its trigger"
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS gallery prerender, delayed hydration, stable preview, browser history and mobile navigation"
    );
  } finally {
    releaseScripts();
    await context.close();
  }
}
