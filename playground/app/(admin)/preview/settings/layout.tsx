import type { ReactNode } from "react";
import { Suspense } from "react";

import { AdminSettingsLayout } from "@/components/admin/admin-settings-layout";
import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsPreviewAppearance } from "@/playground/settings-preview-appearance";

const SettingsPreviewLayout = ({ children }: { children: ReactNode }) => (
  <AdminShell
    currentPath="/admin/settings"
    user={{ name: "Alex Morgan", email: "alex@example.com" }}
  >
    <Suspense fallback={null}>
      <SettingsPreviewAppearance />
    </Suspense>
    <AdminSettingsLayout basePath="/preview/settings">
      {children}
    </AdminSettingsLayout>
  </AdminShell>
);

export default SettingsPreviewLayout;
