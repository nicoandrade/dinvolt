import type { ReactNode } from "react";

import { AdminSettingsLayout } from "@/components/admin-settings-layout";

const SettingsLayout = ({ children }: { children: ReactNode }) => (
  <AdminSettingsLayout>{children}</AdminSettingsLayout>
);

export default SettingsLayout;
