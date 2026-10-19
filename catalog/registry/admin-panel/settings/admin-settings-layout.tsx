"use client";

import type { ReactNode } from "react";

import { AdminTabs } from "@/components/admin-tabs";
import Configurations from "@/components/icons/outline/configurations";
import Preference from "@/components/icons/outline/preference";
import { PageHeader } from "@/components/page-header";

const AdminSettingsLayout = ({
  children,
  basePath = "/admin/settings",
}: {
  children: ReactNode;
  basePath?: string;
}) => (
  <section
    aria-labelledby="settings-title"
    className="flex min-w-0 flex-col gap-6"
  >
    <PageHeader
      title="Settings"
      titleId="settings-title"
      description="Explore the example settings. Changes are temporary and do not affect your application."
    />
    <AdminTabs
      label="Settings sections"
      tabs={[
        { label: "General", href: basePath, icon: Configurations },
        {
          label: "Preferences",
          href: `${basePath}/preferences`,
          icon: Preference,
        },
      ]}
    />
    {children}
  </section>
);

export { AdminSettingsLayout };
