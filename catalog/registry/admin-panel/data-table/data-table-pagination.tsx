"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { tablePageSizes } from "@/lib/table-query";

const DataTablePagination = ({
  page,
  perPage,
  selectedPerPage = perPage,
  total,
  count,
  hasData,
  loading = false,
  disabled,
  label,
  onPageChange,
  onPerPageChange,
}: {
  page: number;
  perPage: number;
  selectedPerPage?: number;
  total: number;
  count: number;
  hasData: boolean;
  loading?: boolean;
  disabled: boolean;
  label: string;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}) => {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  let pageCountContent: ReactNode = loading ? (
    <span
      aria-hidden="true"
      data-slot="skeleton"
      className="bg-muted inline-block h-4 w-4 animate-pulse rounded-md align-middle"
    />
  ) : (
    "—"
  );
  if (hasData) {
    pageCountContent = pageCount;
  }
  const previous = hasData && !disabled && page > 1;
  const next = hasData && !disabled && page < pageCount;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 text-xs [&_select]:text-xs">
      <p aria-live="polite" className="text-muted-foreground">
        {hasData ? (
          <>
            <span className="text-foreground font-medium tabular-nums">
              {count ? (page - 1) * perPage + 1 : 0}
            </span>
            –
            <span className="text-foreground font-medium tabular-nums">
              {count ? (page - 1) * perPage + count : 0}
            </span>{" "}
            of{" "}
            <span className="text-foreground font-medium tabular-nums">
              {total}
            </span>{" "}
            {label}
          </>
        ) : (
          <>
            {loading ? (
              <span
                aria-hidden="true"
                data-slot="skeleton"
                className="bg-muted inline-block h-4 w-14 animate-pulse rounded-md align-middle"
              />
            ) : (
              "—"
            )}{" "}
            of{" "}
            {loading ? (
              <span
                aria-hidden="true"
                data-slot="skeleton"
                className="bg-muted inline-block h-4 w-6 animate-pulse rounded-md align-middle"
              />
            ) : (
              "—"
            )}{" "}
            {label}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows per page</span>
          <NativeSelect
            aria-label="Rows per page"
            onChange={(event) => onPerPageChange(Number(event.target.value))}
            size="sm"
            value={selectedPerPage}
          >
            {tablePageSizes.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground whitespace-nowrap">
            Page{" "}
            <span className="text-foreground font-medium tabular-nums">
              {page}
            </span>{" "}
            of{" "}
            <span className="text-foreground font-medium tabular-nums">
              {pageCountContent}
            </span>
          </span>
          <nav
            aria-label={`${label} pagination`}
            className="flex items-center gap-2"
          >
            <Button
              aria-label="Go to first page"
              disabled={!previous}
              onClick={() => onPageChange(1)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronsLeft aria-hidden="true" />
            </Button>
            <Button
              aria-label="Go to previous page"
              disabled={!previous}
              onClick={() => onPageChange(page - 1)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              aria-label="Go to next page"
              disabled={!next}
              onClick={() => onPageChange(page + 1)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
            <Button
              aria-label="Go to last page"
              disabled={!next}
              onClick={() => onPageChange(pageCount)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronsRight aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </div>
    </div>
  );
};

export { DataTablePagination };
