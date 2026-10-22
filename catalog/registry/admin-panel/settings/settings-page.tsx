import type { Metadata } from "next";

import { AdminSettingsGeneral } from "@/components/admin-settings-general";

// AdminGate may redirect before this page renders; skip instant UI validation.
export const instant = false;
export const metadata: Metadata = { title: "General settings | Admin Panel" };

const SettingsPage = () => <AdminSettingsGeneral />;

export default SettingsPage;
