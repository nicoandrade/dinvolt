import type { Metadata } from "next";

import { AdminUsers } from "@/components/admin-users";

export const metadata: Metadata = { title: "Users | Admin Panel" };
const UsersPage = () => <AdminUsers />;

export default UsersPage;
