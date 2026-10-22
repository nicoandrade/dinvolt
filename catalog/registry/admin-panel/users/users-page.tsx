import type { Metadata } from "next";

import { AdminUsers } from "@/components/admin-users";

// AdminGate may redirect before this page renders; skip instant UI validation.
export const instant = false;
export const metadata: Metadata = { title: "Users | Admin Panel" };
const UsersPage = () => <AdminUsers />;

export default UsersPage;
