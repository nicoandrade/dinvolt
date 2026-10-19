import assert from "node:assert/strict";
import { join } from "node:path";

import type { Page } from "playwright";

export async function checkDeleteButtons(
  page: Page,
  origin: string,
  output: string,
  area: "admin" | "public" = "admin"
) {
  const preview = `${origin}/${area === "public" ? "public-preview" : "preview"}/delete-button`;
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto(`${preview}`);
    await page.evaluate(() => document.fonts.ready);
    for (const title of ["Icon and text", "Text only", "Icon only"]) {
      const section = page.getByRole("region", { name: title, exact: true });
      const button = section.getByRole("button");
      const layout = await button.boundingBox();
      const calls = section.getByText("Delete calls: 0", { exact: true });
      await button.dblclick();
      assert.equal(await button.getAttribute("aria-label"), "Are you sure?");
      assert.equal(
        await calls.isVisible(),
        true,
        "Double-click must not delete"
      );
      await page.getByRole("heading", { name: "Two-step deletion" }).click();
      assert.equal(await button.getAttribute("aria-label"), "Delete");
      await button.click();
      await button.press("Escape");
      assert.equal(await button.getAttribute("aria-label"), "Delete");
      await button.click();
      await page.getByRole("button", { name: "Outside focus target" }).focus();
      assert.equal(await button.getAttribute("aria-label"), "Delete");

      await button.focus();
      await page.keyboard.down("Enter");
      await page.keyboard.down("Enter");
      await page.keyboard.up("Enter");
      assert.equal(await calls.isVisible(), true, "Held Enter must not delete");
      assert.equal(await button.getAttribute("aria-label"), "Are you sure?");
      await page.waitForTimeout(600);
      const confirmationLayout = await button.boundingBox();
      assert.ok(layout && confirmationLayout);
      assert.equal(confirmationLayout.height, layout.height);
      if (title === "Icon only") {
        assert.equal(confirmationLayout.width, layout.width);
      } else {
        assert.ok(
          confirmationLayout.width > layout.width,
          "Confirmation expands from the natural Delete width"
        );
        const label = button.locator(".t-text-swap");
        assert.equal(await label.textContent(), "Are you sure?");
        assert.equal(
          await button.locator(".invisible").count(),
          0,
          "Future labels must not reserve space"
        );
      }
      if (title !== "Text only") {
        assert.equal(
          await button
            .locator('[data-icon="c"]')
            .evaluate((node) => getComputedStyle(node).opacity),
          "1"
        );
      }
      await button.press("Enter");
      assert.equal(await button.getAttribute("aria-label"), "Deleting…");
      assert.equal(await button.isDisabled(), true);
      await section.getByText("Delete calls: 1", { exact: true }).waitFor();
      // Even programmatic repeated clicks cannot reach the consumer while pending.
      await button.evaluate((node: HTMLButtonElement) => {
        node.click();
        node.click();
      });
      await page.getByRole("heading", { name: "Two-step deletion" }).click();
      assert.equal(await button.getAttribute("aria-label"), "Deleting…");
      await page.waitForTimeout(600);
      const pendingLayout = await button.boundingBox();
      assert.ok(pendingLayout);
      assert.equal(pendingLayout.height, layout.height);
      if (title === "Icon only") {
        assert.equal(pendingLayout.width, layout.width);
      } else {
        assert.ok(pendingLayout.width > layout.width);
      }
      await section
        .getByText("Deleted successfully.", { exact: true })
        .waitFor();
      assert.equal(await button.getAttribute("aria-label"), "Delete");
      await page.waitForTimeout(650);
      const resetLayout = await button.boundingBox();
      assert.ok(resetLayout);
      assert.ok(
        Math.abs(resetLayout.width - layout.width) < 1,
        "Completion returns to the initial natural width"
      );
      assert.equal(
        await section.getByText("Delete calls: 1", { exact: true }).isVisible(),
        true
      );
      await button.click();
      assert.equal(await button.getAttribute("aria-label"), "Are you sure?");
      await page.waitForTimeout(600);
      await button.press("Escape");
      await page.waitForTimeout(600);
      const cancelledLayout = await button.boundingBox();
      assert.ok(cancelledLayout);
      assert.ok(
        Math.abs(cancelledLayout.width - layout.width) < 1,
        "Cancellation shrinks back to the initial width"
      );
    }
  }

  await page.goto(`${preview}?scenario=error`);
  const section = page.getByRole("region", { name: "Text only", exact: true });
  const button = section.getByRole("button");
  await button.click();
  await button.click();
  await section
    .getByText("Unable to delete. Try again.", { exact: true })
    .waitFor();
  await button.click();
  assert.equal(await button.getAttribute("aria-label"), "Are you sure?");
  assert.equal(
    await section.getByText("Delete calls: 1", { exact: true }).isVisible(),
    true
  );
  await button.click();
  await section.getByText("Delete calls: 2", { exact: true }).waitFor();

  for (const scenario of ["pending", "disabled"]) {
    await page.goto(`${preview}?scenario=${scenario}`);
    for (const candidate of await page.locator("section button").all()) {
      assert.equal(await candidate.isDisabled(), true);
      await candidate.evaluate((node: HTMLButtonElement) => node.click());
      assert.equal(await candidate.getAttribute("data-confirming"), "false");
    }
    assert.equal(
      await page.getByText("Delete calls: 0", { exact: true }).count(),
      3
    );
  }

  for (const width of [390, 1280]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${preview}?theme=${theme}`);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
      await page.screenshot({
        path: join(output, `${area}-delete-button-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  console.log(
    "PASS DeleteButton: two steps, double-click/held-key guard, cancellation, natural width expansion/contraction, pending, retry, themes and mobile layout"
  );
}
