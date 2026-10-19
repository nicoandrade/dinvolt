"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdminTab {
  href: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}

interface AdminTabsProps {
  label?: string;
  tabs: readonly AdminTab[];
}

const AdminTabs = ({ label = "Sections", tabs }: AdminTabsProps) => {
  const pathname = usePathname();
  const router = useRouter();
  // A nested tab wins over its parent; sibling prefixes never match.
  let activeTab: AdminTab | undefined;
  for (const tab of tabs) {
    const matches =
      pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    if (matches && (!activeTab || tab.href.length > activeTab.href.length)) {
      activeTab = tab;
    }
  }

  return (
    <div className="min-w-0" data-slot="admin-tabs">
      <div className="sm:hidden">
        <Select
          items={tabs.map((tab) => ({ label: tab.label, value: tab.href }))}
          onValueChange={(href) => {
            if (href && href !== activeTab?.href) {
              router.push(href);
            }
          }}
          value={activeTab?.href ?? null}
        >
          <SelectTrigger aria-label={label} className="w-full">
            <SelectValue placeholder="Select a section" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <SelectItem key={tab.href} value={tab.href}>
                    {Icon ? <Icon aria-hidden="true" /> : null}
                    {tab.label}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <nav
        aria-label={label}
        className="before:border-border relative -mx-(--admin-content-padding) hidden min-w-0 overflow-x-auto px-(--admin-content-padding) before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:border-b sm:block"
      >
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab?.href === tab.href;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:outline-ring relative flex items-center gap-2 border-b px-3 py-3 text-sm font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-2 [&_svg]:size-4.5",
                  active
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:border-border hover:text-foreground border-transparent"
                )}
                href={tab.href}
                key={tab.href}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export { AdminTabs };
export type { AdminTab, AdminTabsProps };
