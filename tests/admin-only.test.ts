import { expect, test } from "bun:test";

import { adminOnlySource } from "../src/admin-only.ts";
import { loadRegistryBlock } from "../src/registry.ts";

test("standalone routes preserve auth modules, API paths and external dependencies", async () => {
  const block = await loadRegistryBlock(
    "@dinvolt/admin-panel",
    "admin",
    "admin"
  );
  expect(block.files).toContain("src/app/(admin)/(auth)/page.tsx");
  expect(block.files).toContain(
    "src/app/(admin)/(protected)/dashboard/page.tsx"
  );
  expect(block.files).toContain(
    "src/app/(admin)/(protected)/users/[userId]/page.tsx"
  );
  expect(block.files).toContain("src/app/api/admin/users/export/route.ts");
  expect(block.files).not.toContain("src/components/logo-iso.tsx");
  expect(block.files).not.toContain("src/components/logo-complete.tsx");
  expect(block.assets[0]?.target).toBe("src/components/login-background.jpg");
  const source = block.item.files?.map((file) => file.content).join("\n") ?? "";
  expect(source).toContain('router.replace("/dashboard")');
  expect(source).toContain('redirect("/")');
  expect(source).toContain('redirectTo: "/reset-password"');
  expect(source).toContain('window.location.assign("/")');
  expect(source).toContain('"@/lib/admin-auth"');
  expect(source).not.toContain('"/admin');
  expect(source).not.toContain("components/admin/");
  expect(source).not.toContain("Back to home");
  expect(source).not.toContain("Visit website");
  const combined = await loadRegistryBlock(
    "@dinvolt/admin-panel",
    "admin",
    "public-admin"
  );
  const combinedSource =
    combined.item.files?.map((file) => file.content).join("\n") ?? "";
  expect(combinedSource).toContain("Back to home");
  expect(combinedSource).toContain("Visit website");
  expect(
    adminOnlySource('import { admin } from "better-auth/plugins/admin";')
  ).toContain("better-auth/plugins/admin");
});
