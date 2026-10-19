import assert from "node:assert/strict";
import { join } from "node:path";

import type { Page, Request } from "playwright";

export async function checkActionButtons(
  page: Page,
  origin: string,
  output: string,
  area: "admin" | "public" = "admin"
) {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto(
      `${origin}/${area === "public" ? "public-preview" : "preview"}/action-button`
    );
    for (const title of [
      "Icon and text",
      "Text only",
      "Icon only",
      "Login action",
    ]) {
      const section = page.getByRole("region", { name: title, exact: true });
      const button = section.getByRole("button");
      const layout = await button.boundingBox();
      const textOnly = title === "Text only" || title === "Login action";
      if (textOnly) {
        const labelLayout = await button.locator(".t-text-swap").boundingBox();
        assert.ok(layout && labelLayout);
        assert.ok(
          Math.abs(
            labelLayout.x +
              labelLayout.width / 2 -
              (layout.x + layout.width / 2)
          ) < 1
        );
      }
      await button.click();
      assert.equal(await button.getAttribute("aria-busy"), "true");
      assert.equal(await button.isDisabled(), true);
      assert.equal(
        await button.getAttribute("aria-label"),
        title === "Text only"
          ? "Saving…"
          : title === "Login action"
            ? "Signing in…"
            : "Exporting…"
      );
      assert.deepEqual(await button.boundingBox(), layout);
      for (let frame = 0; frame < 3; frame += 1) {
        await page.waitForTimeout(50);
        assert.deepEqual(
          await button.boundingBox(),
          layout,
          "The button must stay stable throughout the transition"
        );
      }
      assert.equal(await button.locator('[data-slot="spinner"]').count(), 1);
      await page.waitForFunction((heading) => {
        const candidate = [...document.querySelectorAll("section")].find(
          (node) => node.querySelector("h2")?.textContent === heading
        );
        const spinner = candidate?.querySelector('[data-icon="b"]');
        const reveal = candidate?.querySelector(".t-action-spinner");
        return (
          spinner &&
          getComputedStyle(spinner).opacity === "1" &&
          (!reveal || reveal.getBoundingClientRect().width >= 16)
        );
      }, title);
      assert.deepEqual(await button.boundingBox(), layout);
      await page.waitForFunction((heading) => {
        const candidate = [...document.querySelectorAll("section")].find(
          (node) => node.querySelector("h2")?.textContent === heading
        );
        return (
          candidate?.querySelector("button")?.getAttribute("aria-busy") ===
            "false" &&
          getComputedStyle(
            candidate.querySelector('[data-icon="b"]') as Element
          ).opacity === "0" &&
          (candidate.querySelector(".t-action-spinner")?.getBoundingClientRect()
            .width ?? 0) === 0
        );
      }, title);
      assert.equal(await button.isEnabled(), true);
      assert.deepEqual(await button.boundingBox(), layout);
      if (textOnly) {
        const labelLayout = await button.locator(".t-text-swap").boundingBox();
        assert.ok(layout && labelLayout);
        assert.ok(
          Math.abs(
            labelLayout.x +
              labelLayout.width / 2 -
              (layout.x + layout.width / 2)
          ) < 1
        );
      }
    }

    if (area === "public") {
      continue;
    }
    await page.goto(`${origin}/preview/users?delay=1000`);
    await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
    const button = page.getByRole("button", {
      name: "Export CSV",
      exact: true,
    });
    const layout = await button.boundingBox();
    const rows = page
      .getByRole("table", { name: "Users", exact: true })
      .locator("tbody tr");
    const requests: string[] = [];
    const record = (request: Request) => {
      if (new URL(request.url()).pathname === "/api/admin/users/export") {
        requests.push(request.url());
      }
    };
    page.on("request", record);
    const downloaded = page.waitForEvent("download");
    await button.click();
    const exporting = page.getByRole("button", {
      name: "Exporting…",
      exact: true,
    });
    await exporting.waitFor();
    assert.equal(await exporting.isDisabled(), true);
    assert.equal(await exporting.getAttribute("aria-busy"), "true");
    assert.deepEqual(await exporting.boundingBox(), layout);
    assert.equal(await rows.count(), 10);
    await exporting.evaluate((node: HTMLButtonElement) => {
      node.click();
      node.click();
    });
    await page.waitForFunction(
      () => document.querySelector(".t-text-swap")?.textContent === "Exporting…"
    );
    if (reducedMotion === "reduce") {
      assert.equal(
        await exporting
          .locator(".t-text-swap")
          .evaluate((node) => getComputedStyle(node).transitionDuration),
        "0s"
      );
    }
    await page.screenshot({
      path: join(output, `export-pending-${reducedMotion}.png`),
      fullPage: true,
    });
    const file = await downloaded;
    assert.equal(file.suggestedFilename(), "users-preview.csv");
    await button.waitFor();
    await page.waitForFunction(
      () => document.querySelector(".t-text-swap")?.textContent === "Export CSV"
    );
    assert.equal(await button.isEnabled(), true);
    assert.deepEqual(await button.boundingBox(), layout);
    assert.equal(
      requests.length,
      1,
      "Repeated activation must not start another export"
    );
    page.off("request", record);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  if (area === "public") {
    console.log(
      "PASS Public ActionButton variants, pending feedback, stable width and reduced motion"
    );
    return;
  }
  await page.goto(`${origin}/preview/users?scenario=export-error`);
  await page.locator('[data-preview-ready="true"]').waitFor();
  await page.getByText("1–10 of 27 users", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Unable to export CSV" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Export CSV", exact: true })
      .isEnabled(),
    true
  );
  const retry = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await retry;
  assert.equal(
    await page
      .getByRole("alert")
      .filter({ hasText: "Unable to export CSV" })
      .count(),
    0
  );
  console.log(
    "PASS Action button variants, pending download, stable width, duplicate activation, reduced motion and export retry"
  );
}
