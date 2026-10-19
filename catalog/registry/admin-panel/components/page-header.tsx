import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  actions?: ReactNode;
}

const PageHeader = ({
  title,
  titleId,
  description,
  actions,
}: PageHeaderProps) => (
  <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight" id={titleId}>
        {title}
      </h1>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    ) : null}
  </header>
);

export { PageHeader };
export type { PageHeaderProps };
