import type { Metadata } from "next";

import { AdminHome } from "@/components/admin-home";

export const metadata: Metadata = { title: "Home | Admin Panel" };

const AdminPage = () => <AdminHome />;

export default AdminPage;
