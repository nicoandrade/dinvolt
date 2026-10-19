"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  AdminBreadcrumb,
  AdminBreadcrumbProvider,
} from "@/components/admin-breadcrumb";
import { AdminUserMenu } from "@/components/admin-user-menu";
import Configurations from "@/components/icons/outline-duo/configurations";
import Home from "@/components/icons/outline-duo/home";
import Users from "@/components/icons/outline-duo/users";
import OpenExternal from "@/components/icons/outline/open-external";
import SidebarCollapse from "@/components/icons/outline/sidebar-collapse";
import SidebarExpand from "@/components/icons/outline/sidebar-expand";
import { LogoComplete } from "@/components/logo-complete";
import { LogoIso } from "@/components/logo-iso";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAdminUser } from "@/hooks/use-admin-user";

interface AdminUser {
  name: string;
  email: string;
}

const AdminSidebarTrigger = () => {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  const Icon = expanded ? SidebarCollapse : SidebarExpand;
  return (
    /* eslint-disable shadcn/no-restyle -- The sidebar toggle stays transparent when expanded; only hover indicates an action. */
    <Button
      aria-expanded={expanded}
      className="aria-expanded:hover:bg-muted dark:aria-expanded:hover:bg-muted/50 -ml-1 size-9 aria-expanded:bg-transparent [&_svg]:size-4.5"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      onClick={toggleSidebar}
      size="icon-sm"
      variant="ghost"
    >
      <Icon aria-hidden="true" className="cn-rtl-flip" />
      <span className="sr-only">
        {expanded ? "Collapse sidebar" : "Expand sidebar"}
      </span>
    </Button>
    /* eslint-enable shadcn/no-restyle */
  );
};

const AdminSidebar = ({
  user,
  pathname,
}: {
  user?: AdminUser;
  pathname: string;
}) => {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <Link
          aria-label="Dinvolt home"
          className="ring-sidebar-ring flex h-12 items-center rounded-md px-2 outline-hidden group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1 focus-visible:ring-2"
          href="/admin/home"
          onClick={() => setOpenMobile(false)}
        >
          <LogoComplete
            aria-hidden="true"
            className="h-7 w-auto shrink-0 group-data-[collapsible=icon]:hidden"
          />
          <LogoIso
            aria-hidden="true"
            className="hidden h-6 w-auto shrink-0 group-data-[collapsible=icon]:block"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Admin navigation">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-current={
                      pathname === "/admin/home" ? "page" : undefined
                    }
                    isActive={pathname === "/admin/home"}
                    onClick={() => setOpenMobile(false)}
                    render={<Link href="/admin/home" />}
                    tooltip="Home"
                  >
                    <Home aria-hidden="true" />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-current={
                      pathname === "/admin/users" ? "page" : undefined
                    }
                    isActive={
                      pathname === "/admin/users" ||
                      pathname.startsWith("/admin/users/")
                    }
                    onClick={() => setOpenMobile(false)}
                    render={<Link href="/admin/users" />}
                    tooltip="Users"
                  >
                    <Users aria-hidden="true" />
                    <span>Users</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-current={
                      pathname === "/admin/settings" ? "page" : undefined
                    }
                    isActive={
                      pathname === "/admin/settings" ||
                      pathname.startsWith("/admin/settings/")
                    }
                    onClick={() => setOpenMobile(false)}
                    render={<Link href="/admin/settings" />}
                    tooltip="Settings"
                  >
                    <Configurations aria-hidden="true" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setOpenMobile(false)}
                  render={<Link href="/" />}
                  tooltip="Visit website"
                >
                  <OpenExternal aria-hidden="true" />
                  <span>Visit website</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <AdminUserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};

const AdminShell = ({
  children,
  user,
  currentPath,
  breadcrumbParentHref,
}: {
  children: ReactNode;
  user?: AdminUser;
  currentPath?: string;
  breadcrumbParentHref?: string;
}) => {
  const pathname = usePathname();
  const identity = useAdminUser();
  const activePath = currentPath ?? pathname;
  let pageTitle = "Home";
  if (activePath === "/admin/users" || activePath.startsWith("/admin/users/")) {
    pageTitle = "Users";
  } else if (
    activePath === "/admin/settings" ||
    activePath.startsWith("/admin/settings/")
  ) {
    pageTitle = "Settings";
  }
  return (
    <AdminBreadcrumbProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AdminSidebar pathname={activePath} user={user ?? identity} />
          <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <AdminSidebarTrigger />
              <Separator
                className="mr-2 data-vertical:h-4 data-vertical:self-center"
                orientation="vertical"
              />
              <AdminBreadcrumb
                path={activePath}
                sectionTitle={pageTitle}
                identityId={identity?.id}
                parentHref={breadcrumbParentHref}
              />
            </header>
            <div className="flex flex-1 flex-col gap-6 p-(--admin-content-padding) [--admin-content-padding:--spacing(4)] md:[--admin-content-padding:--spacing(6)]">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </AdminBreadcrumbProvider>
  );
};

export { AdminShell };
