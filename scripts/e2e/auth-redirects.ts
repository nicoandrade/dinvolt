import assert from "node:assert/strict";

import type { Browser, BrowserContext } from "playwright";

export async function observePanel(context: BrowserContext) {
  const rendered: string[] = [];
  let recording = false;
  await context.exposeBinding("reportAdminRender", (_, path: string) => {
    if (recording) {
      rendered.push(path);
    }
  });
  await context.addInitScript(() => {
    // eslint-disable-next-line unicorn/consistent-function-scoping -- Playwright serializes this callback into the browser realm.
    const inspect = () => {
      const panel = document.querySelector(
        '[data-sidebar="sidebar"], [data-slot="sidebar"], nav[aria-label="Admin navigation"], [data-slot="skeleton"]'
      );
      if (panel) {
        void (
          window as typeof window & {
            reportAdminRender: (path: string) => Promise<void>;
          }
        ).reportAdminRender(location.pathname);
      }
    };
    new MutationObserver(inspect).observe(document, {
      childList: true,
      subtree: true,
    });
    addEventListener("pageshow", inspect);
  });
  return {
    start() {
      rendered.length = 0;
      recording = true;
    },
    assertHidden() {
      recording = false;
      assert.deepEqual(
        rendered,
        [],
        "Unauthorized navigation rendered panel UI."
      );
    },
  };
}

export async function checkAuthRedirects(
  browser: Browser,
  origin: string,
  standalone: boolean
) {
  const login = standalone ? "/" : "/admin";
  const prefix = standalone ? "" : "/admin";
  const paths = [
    standalone ? "/dashboard" : "/admin/home",
    `${prefix}/users`,
    `${prefix}/users/unknown-user`,
    `${prefix}/settings`,
    `${prefix}/settings/preferences`,
  ];
  const context = await browser.newContext();
  context.setDefaultTimeout(60_000);
  context.setDefaultNavigationTimeout(120_000);
  const observer = await observePanel(context);
  const page = await context.newPage();
  try {
    for (const path of [
      ...paths,
      ...(standalone ? [] : ["/admin/new-section"]),
    ]) {
      const response = await context.request.get(`${origin}${path}`, {
        maxRedirects: 0,
      });
      assert.equal(response.status(), 307);
      const { location } = response.headers();
      assert.ok(location);
      assert.equal(new URL(location, origin).href, `${origin}${login}`);
    }
    for (const path of [
      login,
      `${prefix}/forgot-password`,
      `${prefix}/reset-password`,
    ]) {
      const response = await context.request.get(`${origin}${path}`, {
        maxRedirects: 0,
      });
      assert.equal(
        response.status(),
        200,
        `Auth route must remain public: ${path}`
      );
    }
    if (!standalone) {
      assert.equal(
        (await context.request.get(origin, { maxRedirects: 0 })).status(),
        200
      );
    }
    await page.goto(`${origin}${login}`);
    const socialImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");
    assert.ok(socialImage);
    // Use this test server even if the build's default metadata origin differs.
    const imagePath = new URL(socialImage, origin).pathname;
    const image = await context.request.get(`${origin}${imagePath}`, {
      maxRedirects: 0,
    });
    assert.equal(
      image.status(),
      200,
      "The public sign-in social image must not redirect."
    );
    assert.ok(image.headers()["content-type"]?.startsWith("image/"));
    for (const forged of [false, true]) {
      if (forged) {
        await context.addCookies([
          {
            name: "better-auth.session_token",
            value: "invalid-session",
            url: origin,
          },
        ]);
      }
      for (const path of paths) {
        observer.start();
        await page.goto(`${origin}${path}`);
        await page
          .getByRole("heading", { name: "Admin sign in", exact: true })
          .waitFor();
        await page.waitForLoadState("networkidle");
        assert.equal(new URL(page.url()).pathname, login);
        observer.assertHidden();
      }
    }
  } finally {
    await context.close();
  }
}
