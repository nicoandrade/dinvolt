import assert from "node:assert/strict";

import type { Browser } from "playwright";

export const checkCopyButton = async (browser: Browser, origin: string) => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/preview/user`);
    const button = page.getByRole("button", {
      name: "Copy email",
      exact: true,
    });
    await button.waitFor();
    const email = await button.locator("span").first().textContent();
    const icon = button.locator(".t-icon-swap");
    const layout = await button.boundingBox();
    const fieldHeight = await page
      .locator("dd")
      .nth(1)
      .evaluate((node) => node.getBoundingClientRect().height);
    assert.equal(
      layout?.height,
      fieldHeight,
      "Copy must preserve the field height"
    );
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>(
          'button[aria-label="Copy email"] .t-icon-swap'
        )?.dataset.state === "b"
    );
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      email
    );
    await page.waitForFunction(() => {
      const check = document.querySelector(
        'button[aria-label="Copy email"] [data-icon="b"]'
      );
      return check && getComputedStyle(check).opacity === "1";
    });
    assert.deepEqual(await button.boundingBox(), layout);
    assert.equal(
      await icon
        .locator('[data-icon="b"]')
        .evaluate((node) => getComputedStyle(node).opacity),
      "1"
    );
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await button.evaluate((node: HTMLButtonElement) => node.click());
    await page.clock.runFor(1999);
    assert.equal(await icon.getAttribute("data-state"), "b");
    await page.clock.runFor(1);
    assert.equal(await icon.getAttribute("data-state"), "a");
    assert.deepEqual(await button.boundingBox(), layout);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await button.evaluate((node: HTMLButtonElement) => node.click());
    await page
      .getByText("Copied to clipboard.", { exact: true })
      .waitFor({ state: "attached" });
    await page.clock.runFor(1000);
    await button.evaluate((node: HTMLButtonElement) => node.click());
    await page.clock.runFor(1999);
    assert.equal(await icon.getAttribute("data-state"), "b");
    await page.clock.runFor(1);
    assert.equal(await icon.getAttribute("data-state"), "a");
    assert.equal(
      await icon
        .locator('[data-icon="a"]')
        .evaluate((node) => getComputedStyle(node).transitionDuration),
      "0s"
    );

    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      });
    });
    await button.evaluate((node: HTMLButtonElement) => node.click());
    await page
      .getByText("Unable to copy. Please try again.", { exact: true })
      .waitFor();
    assert.equal(await icon.getAttribute("data-state"), "a");
    await page.evaluate(() =>
      Reflect.deleteProperty(navigator.clipboard, "writeText")
    );
    await button.evaluate((node: HTMLButtonElement) => node.click());
    await page
      .getByText("Copied to clipboard.", { exact: true })
      .waitFor({ state: "attached" });
    assert.equal(await icon.getAttribute("data-state"), "b");
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      email
    );
    console.log(
      "PASS CopyButton: real clipboard, keyboard, stable layout, two-second reset, repeated copy, reduced motion and error retry"
    );
  } finally {
    await context.close();
  }
};
