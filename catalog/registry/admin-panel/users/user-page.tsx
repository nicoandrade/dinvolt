import type { Metadata } from "next";

import { AdminUser } from "@/components/admin-user";

// AdminGate may redirect before this page renders; skip instant UI validation.
export const instant = false;
export const metadata: Metadata = { title: "User | Admin Panel" };
const UserPage = ({ params }: { params: Promise<{ userId: string }> }) => (
  <AdminUser params={params} />
);

export default UserPage;
