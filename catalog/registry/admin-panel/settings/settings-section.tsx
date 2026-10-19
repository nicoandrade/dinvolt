import type { ReactNode } from "react";

const SettingsSection = ({
  title,
  description,
  children,
  titleId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  titleId: string;
}) => (
  <section
    aria-labelledby={titleId}
    className="grid min-w-0 gap-6 border-b pb-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10"
  >
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium" id={titleId}>
        {title}
      </h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);

export { SettingsSection };
