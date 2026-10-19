import type { Metadata } from "next";

import { AdminUser } from "@/components/admin-user";

export const metadata: Metadata = { title: "User | Admin Panel" };
const UserPage = ({ params }: { params: Promise<{ userId: string }> }) => (
  <AdminUser params={params} />
);

export default UserPage;
