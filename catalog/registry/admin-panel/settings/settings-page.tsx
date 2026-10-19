import type { Metadata } from "next";

import { AdminSettingsGeneral } from "@/components/admin-settings-general";

export const metadata: Metadata = { title: "General settings | Admin Panel" };

const SettingsPage = () => <AdminSettingsGeneral />;

export default SettingsPage;
