import type { Metadata } from "next";

import { AdminHome } from "@/components/admin-home";

// AdminGate may redirect before this page renders; skip instant UI validation.
export const instant = false;
export const metadata: Metadata = { title: "Home | Admin Panel" };

const AdminPage = () => <AdminHome />;

export default AdminPage;
