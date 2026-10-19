"use client";

import { createColumnHelper } from "@tanstack/react-table";

import type { dataTableFeatures } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  emailVerified: boolean;
  banned?: boolean | null;
  createdAt: Date | string;
}
const columnHelper = createColumnHelper<
  typeof dataTableFeatures,
  AdminUserRow
>();
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const usersColumns = columnHelper.columns([
  columnHelper.accessor("name", {
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    header: "Name",
  }),
  columnHelper.accessor("email", {
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.email}</span>
    ),
    header: "Email",
  }),
  columnHelper.accessor("role", {
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.role || "user"}</Badge>
    ),
    header: "Role",
  }),
  columnHelper.accessor("emailVerified", {
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.emailVerified ? "Verified" : "Unverified"}
      </span>
    ),
    header: "Email verified",
  }),
  columnHelper.accessor("banned", {
    cell: ({ row }) => (
      <Badge variant={row.original.banned ? "destructive" : "secondary"}>
        {row.original.banned ? "Banned" : "Active"}
      </Badge>
    ),
    header: "Status",
  }),
  columnHelper.accessor("createdAt", {
    cell: ({ row }) => (
      <time
        className="text-muted-foreground"
        dateTime={new Date(row.original.createdAt).toISOString()}
      >
        {dateFormatter.format(new Date(row.original.createdAt))}
      </time>
    ),
    header: "Created",
  }),
]);

export { usersColumns };
