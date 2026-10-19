import assert from "node:assert/strict";
import { join } from "node:path";

import type { Browser } from "playwright";

export const checkSettings = async (
  browser: Browser,
  origin: string,
  output: string
) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });
  try {
    await page.goto(`${origin}/preview/settings`);
    const general = page.getByRole("form", {
      name: "General settings",
      exact: true,
    });
    const name = general.getByLabel("Application name", { exact: true });
    const preview = general.getByRole("button", {
      name: "Preview changes",
      exact: true,
    });
    const discard = general.getByRole("button", {
      name: "Discard changes",
      exact: true,
    });
    await name.waitFor();
    assert.equal(await name.inputValue(), "Acme");
    assert.equal(await preview.isDisabled(), true);
    await name.fill("");
    await preview.click();
    await general
      .getByRole("alert")
      .getByText("Enter an application name.")
      .waitFor();
    assert.equal(await name.getAttribute("aria-invalid"), "true");
    await name.fill("Example workspace");
    await discard.click();
    assert.equal(await name.inputValue(), "Acme");
    assert.equal(await general.getByRole("alert").count(), 0);

    // File previews remain local; invalid MIME types and oversized images fail validation.
    const logo = general.getByLabel("Logo", { exact: true });
    const dropZone = general.getByRole("group", {
      name: "Image upload",
      exact: true,
    });
    const uploadTrigger = dropZone.locator(
      '[data-slot="image-upload-trigger"]'
    );
    const pickerFile = {
      name: "picked-logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64"
      ),
    };
    let fileChoosers = 0;
    page.on("filechooser", () => {
      fileChoosers += 1;
    });
    const clickChooser = page.waitForEvent("filechooser");
    // Even the empty padding opens the native picker, without a separate visible button.
    await dropZone.click({ position: { x: 8, y: 8 } });
    await (await clickChooser).setFiles(pickerFile);
    await dropZone.getByText(pickerFile.name, { exact: true }).waitFor();
    assert.equal(
      await dropZone.getByText("Choose image", { exact: true }).count(),
      0
    );
    for (const key of ["Enter", "Space"]) {
      const keyboardChooser = page.waitForEvent("filechooser");
      await uploadTrigger.focus();
      await uploadTrigger.press(key);
      await (
        await keyboardChooser
      ).setFiles({ ...pickerFile, name: `${key}-logo.png` });
      await dropZone.getByText(`${key}-logo.png`, { exact: true }).waitFor();
    }
    await dropZone
      .getByRole("button", { name: "Remove image", exact: true })
      .click();
    await dropZone
      .getByRole("img", { name: "Selected logo preview" })
      .waitFor({ state: "detached" });
    assert.equal(
      fileChoosers,
      3,
      "Removing the image must not reopen the picker"
    );
    const droppedFile = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
        ),
        (character) => character.codePointAt(0) ?? 0
      );
      transfer.items.add(
        new File([bytes], "dropped-logo.png", { type: "image/png" })
      );
      return transfer;
    });
    await dropZone.dispatchEvent("dragenter", { dataTransfer: droppedFile });
    await dropZone.getByText("Drop your image here", { exact: true }).waitFor();
    assert.equal(await dropZone.getAttribute("data-dragging"), "true");
    await page.screenshot({
      animations: "disabled",
      path: join(output, "settings-image-drag.png"),
      fullPage: true,
    });
    // Moving onto a child must not make the highlight blink off.
    await uploadTrigger.dispatchEvent("dragenter", {
      dataTransfer: droppedFile,
    });
    await uploadTrigger.dispatchEvent("dragleave", {
      dataTransfer: droppedFile,
    });
    assert.equal(await dropZone.getAttribute("data-dragging"), "true");
    await dropZone.dispatchEvent("dragleave", { dataTransfer: droppedFile });
    assert.equal(await dropZone.getAttribute("data-dragging"), "false");
    await dropZone.dispatchEvent("dragenter", { dataTransfer: droppedFile });
    await dropZone.dispatchEvent("dragover", { dataTransfer: droppedFile });
    await dropZone.dispatchEvent("drop", { dataTransfer: droppedFile });
    await dropZone.getByText("dropped-logo.png", { exact: true }).waitFor();
    assert.equal(await dropZone.getAttribute("data-dragging"), "false");
    await dropZone
      .getByRole("img", { name: "Selected logo preview" })
      .waitFor();
    const multipleFiles = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["first"], "first.png", { type: "image/png" })
      );
      transfer.items.add(
        new File(["second"], "second.png", { type: "image/png" })
      );
      return transfer;
    });
    await dropZone.dispatchEvent("drop", { dataTransfer: multipleFiles });
    await dropZone
      .getByRole("alert")
      .getByText("Drop one image at a time.")
      .waitFor();
    assert.equal(
      await dropZone.getByText("dropped-logo.png", { exact: true }).isVisible(),
      true
    );
    // Invalid dropped files use the same form validation as the native picker.
    const invalidDrop = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["text"], "dropped.txt", { type: "text/plain" })
      );
      return transfer;
    });
    await dropZone.dispatchEvent("drop", { dataTransfer: invalidDrop });
    await general
      .getByText("Choose a PNG, JPEG or WebP image.", { exact: true })
      .waitFor();
    assert.equal(await dropZone.getByRole("alert").count(), 0);
    await dropZone.dispatchEvent("drop", { dataTransfer: droppedFile });
    await general
      .getByText("Choose a PNG, JPEG or WebP image.", { exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(await general.getByRole("alert").count(), 0);
    await discard.click();
    const textDrag = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", "This is not a file");
      return transfer;
    });
    await dropZone.dispatchEvent("dragenter", { dataTransfer: textDrag });
    assert.equal(await dropZone.getAttribute("data-dragging"), "false");
    await Promise.all([
      droppedFile.dispose(),
      multipleFiles.dispose(),
      invalidDrop.dispose(),
      textDrag.dispose(),
    ]);
    await logo.setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("sample"),
    });
    await general
      .getByText("Choose a PNG, JPEG or WebP image.", { exact: true })
      .waitFor();
    await logo.setInputFiles({
      name: "large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
    await general
      .getByText("Choose an image smaller than 2 MB.", { exact: true })
      .waitFor();
    await logo.setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64"
      ),
    });
    const image = general.getByRole("img", { name: "Selected logo preview" });
    await image.waitFor();
    assert.match((await image.getAttribute("src")) ?? "", /^blob:/u);
    assert.equal(await general.getByRole("alert").count(), 0);
    await discard.click();
    await image.waitFor({ state: "detached" });
    assert.equal(await image.count(), 0);
    await name.fill("Temporary workspace");
    await preview.click();
    await general
      .getByRole("status")
      .getByText("Preview updated. Nothing was saved to your application.")
      .waitFor();
    assert.equal(await preview.isDisabled(), true);
    const logoFile = {
      name: "first-logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64"
      ),
    };
    await logo.setInputFiles(logoFile);
    await preview.click();
    await logo.setInputFiles({ ...logoFile, name: "second-logo.png" });
    await general.getByText("second-logo.png", { exact: true }).waitFor();
    assert.equal(
      await preview.isEnabled(),
      true,
      "Replacing a previewed file must count as a change"
    );
    await discard.click();
    await general.getByText("first-logo.png", { exact: true }).waitFor();
    await page.reload();
    assert.equal(await name.inputValue(), "Acme");
    await page.screenshot({
      path: join(output, "settings-general-light.png"),
      fullPage: true,
    });

    // Keep a reference to the layout DOM node to detect accidental remounts on navigation.
    const tabs = page.getByRole("navigation", {
      name: "Settings sections",
      exact: true,
    });
    const sharedTabs = await tabs.elementHandle();
    assert.ok(sharedTabs);
    await tabs.getByRole("link", { name: "Preferences", exact: true }).click();
    const preferences = page.getByRole("form", {
      name: "Preferences settings",
      exact: true,
    });
    await preferences.waitFor();
    assert.match(page.url(), /\/preview\/settings\/preferences$/u);
    assert.equal(
      await sharedTabs.evaluate((element) => element.isConnected),
      true
    );
    assert.equal(
      await tabs
        .getByRole("link", { name: "Preferences", exact: true })
        .getAttribute("aria-current"),
      "page"
    );
    assert.equal(
      await tabs
        .getByRole("link", { name: "General", exact: true })
        .getAttribute("aria-current"),
      null
    );
    await preferences
      .getByRole("combobox", { name: "Language", exact: true })
      .click();
    await page.getByRole("option", { name: "Español", exact: true }).click();
    const compact = preferences.getByRole("switch", {
      name: "Compact tables",
      exact: true,
    });
    await compact.click();
    assert.equal(await compact.getAttribute("aria-checked"), "true");
    await preferences
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    assert.equal(await compact.getAttribute("aria-checked"), "false");
    assert.equal(
      await preferences
        .getByRole("combobox", { name: "Language", exact: true })
        .locator('[data-slot="select-value"]')
        .textContent(),
      "English"
    );
    await compact.click();
    await preferences
      .getByRole("button", { name: "Preview changes", exact: true })
      .click();
    await preferences
      .getByRole("status")
      .getByText("Preview updated. Nothing was saved to your application.")
      .waitFor();
    await page.reload();
    assert.equal(await compact.getAttribute("aria-checked"), "false");

    // Both themes and breakpoints; the mobile selector navigates to actual pages.
    for (const theme of ["light", "dark"]) {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(
          `${origin}/preview/settings/preferences?theme=${theme}`
        );
        await preferences.waitFor();
        await page.waitForFunction(
          (dark) =>
            document.documentElement.classList.contains("dark") === dark,
          theme === "dark"
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth
          ),
          true
        );
        if (width === 390) {
          const sections = page.getByRole("combobox", {
            name: "Settings sections",
            exact: true,
          });
          await sections.click();
          await page
            .getByRole("option", { name: "General", exact: true })
            .click();
          await general.waitFor();
          assert.equal(
            await sections.locator('[data-slot="select-value"]').textContent(),
            "General"
          );
          assert.equal(
            await page
              .locator("html")
              .evaluate((element) => element.classList.contains("dark")),
            theme === "dark"
          );
        }
        await page.screenshot({
          path: join(output, `settings-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
    assert.deepEqual(
      apiRequests,
      [],
      "Example settings must not request a session, fetch private data or persist changes"
    );
    assert.deepEqual(errors, []);

    // With JavaScript unavailable, the static layout, fields and native links still render.
    const staticContext = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1280, height: 1000 },
    });
    try {
      const staticPage = await staticContext.newPage();
      await staticPage.goto(`${origin}/preview/settings`);
      assert.equal(
        await staticPage
          .getByRole("heading", { name: "Settings", exact: true })
          .isVisible(),
        true
      );
      assert.equal(
        await staticPage
          .getByLabel("Application name", { exact: true })
          .isVisible(),
        true
      );
      assert.equal(await staticPage.locator("[data-slot=skeleton]").count(), 0);
      await staticPage
        .getByRole("navigation", { name: "Settings sections", exact: true })
        .getByRole("link", { name: "Preferences", exact: true })
        .click();
      await staticPage
        .getByRole("combobox", { name: "Language", exact: true })
        .waitFor();
      assert.equal(
        await staticPage
          .getByRole("combobox", { name: "Language", exact: true })
          .isVisible(),
        true
      );
    } finally {
      await staticContext.close();
    }
    await page.goto(`${origin}/admin/settings`);
    await page
      .getByRole("heading", { name: "Admin sign in", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/admin");
  } finally {
    await context.close();
  }
};
