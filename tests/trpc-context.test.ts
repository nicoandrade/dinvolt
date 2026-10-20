import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("tRPC skips anonymous auth initialization and validates present cookies once per request", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    mock.module("server-only", () => ({}));
    let cookie = null;
    let cookieReads = 0;
    let authInitializations = 0;
    let sessionReads = 0;
    let databaseReads = 0;
    let session = null;
    let failure = null;
    let expectedHeaders;
    mock.module("better-auth/cookies", () => ({
      getSessionCookie: headers => {
        assert.equal(headers, expectedHeaders);
        cookieReads++;
        return cookie;
      },
    }));
    mock.module("@/db", () => ({ getDb: () => { databaseReads++; } }));
    mock.module("@/lib/auth", () => ({
      getAuth: () => {
        authInitializations++;
        return { api: { getSession: async ({headers}) => {
          assert.equal(headers, expectedHeaders);
          sessionReads++;
          if (failure) throw failure;
          return session;
        } } };
      },
    }));
    const { createTRPCContext } = await import("./catalog/trpc/context.ts");
    for (const asynchronous of [false, true]) {
      expectedHeaders = new Headers({ cookie: "theme=dark" });
      let headersReads = 0;
      const options = { headers: asynchronous ? async () => { headersReads++; return expectedHeaders; } : expectedHeaders };
      const before = { cookieReads, authInitializations, sessionReads };
      const anonymous = createTRPCContext(options);
      assert.equal(cookieReads, before.cookieReads);
      cookie = null;
      const first = anonymous.getSession();
      assert.equal(anonymous.getSession(), first);
      assert.equal(await first, null);
      assert.equal(cookieReads, before.cookieReads + 1);
      assert.equal(authInitializations, before.authInitializations);
      assert.equal(sessionReads, before.sessionReads);
      assert.equal(headersReads, asynchronous ? 1 : 0);
      cookie = "present-but-untrusted";
      session = null;
      const invalid = createTRPCContext(options);
      const invalidRead = invalid.getSession();
      assert.equal(invalid.getSession(), invalidRead);
      assert.equal(await invalidRead, null);
      assert.equal(authInitializations, before.authInitializations + 1);
      assert.equal(sessionReads, before.sessionReads + 1);
      session = { user: { id: "verified-by-better-auth", role: "user" } };
      const authenticated = createTRPCContext(options);
      const [one, two] = await Promise.all([authenticated.getSession(), authenticated.getSession()]);
      assert.equal(one, session);
      assert.equal(two, session);
      assert.equal(sessionReads, before.sessionReads + 2);
      failure = new Error("Session validation unavailable");
      await assert.rejects(() => createTRPCContext(options).getSession(), error => error === failure);
      failure = null;
    }
    assert.equal(databaseReads, 0);
  `,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf-8" }
  );
  expect(result.status, result.stderr).toBe(0);
});
