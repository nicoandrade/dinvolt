import type { Metadata } from "next";

import { AdminSettingsPreferences } from "@/components/admin-settings-preferences";

// AdminGate may redirect before this page renders; skip instant UI validation.
export const instant = false;
export const metadata: Metadata = { title: "Preferences | Admin Panel" };

const SettingsPreferencesPage = () => <AdminSettingsPreferences />;

export default SettingsPreferencesPage;
