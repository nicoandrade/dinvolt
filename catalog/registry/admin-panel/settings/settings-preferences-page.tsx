import type { Metadata } from "next";

import { AdminSettingsPreferences } from "@/components/admin-settings-preferences";

export const metadata: Metadata = { title: "Preferences | Admin Panel" };

const SettingsPreferencesPage = () => <AdminSettingsPreferences />;

export default SettingsPreferencesPage;
