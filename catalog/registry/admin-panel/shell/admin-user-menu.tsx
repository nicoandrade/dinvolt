"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";

import { useAdminSignOut } from "@/components/sign-out-button";
import { ActionButtonContent } from "@/components/ui/action-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

const AdminUserMenu = ({
  user,
}: {
  user?: { name: string; email: string };
}) => {
  const { isMobile } = useSidebar();
  const { pending, error, signOut } = useAdminSignOut();
  if (!user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton aria-label="User account" disabled size="lg">
            <div className="size-8 shrink-0 overflow-hidden rounded-lg">
              <Skeleton className="size-full" />
            </div>
            <div aria-hidden="true" className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36 max-w-full" />
            </div>
            <ChevronsUpDown aria-hidden="true" className="ml-auto" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }
  const initials =
    user.name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "A";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <ChevronsUpDown aria-hidden="true" className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <span className="block truncate">{user.name}</span>
                <span className="block truncate font-normal">{user.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              aria-busy={pending}
              aria-label={pending ? "Signing out…" : "Sign out"}
              closeOnClick={false}
              disabled={pending}
              onClick={signOut}
            >
              <ActionButtonContent
                align="start"
                icon={<LogOut aria-hidden="true" />}
                pending={pending}
                pendingLabel="Signing out…"
              >
                Sign out
              </ActionButtonContent>
            </DropdownMenuItem>
            {error && (
              <p className="text-destructive px-2 py-2 text-sm" role="alert">
                {error}
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <output aria-live="polite" className="sr-only">
          {pending ? "Signing out…" : ""}
        </output>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export { AdminUserMenu };
