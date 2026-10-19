"use client";

import { tableFeatures, useTable } from "@tanstack/react-table";
import type { ColumnDef, RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TableQuery } from "@/lib/table-query";

// Only render the server's page: no client-side filtering/sorting/pagination models.
const dataTableFeatures = tableFeatures({});

const DataTable = <TData extends RowData>({
  columns,
  data,
  getRowId,
  label,
  sortBy,
  sortDirection,
  sortableColumns,
  onSortChange,
  isFetching,
  empty,
  loadingRowCount,
  getRowHref,
}: {
  columns: ColumnDef<typeof dataTableFeatures, TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  label: string;
  sortBy: string;
  sortDirection: TableQuery["sortDirection"];
  sortableColumns: readonly string[];
  onSortChange: (field: string) => void;
  isFetching: boolean;
  empty: ReactNode;
  loadingRowCount?: number;
  getRowHref?: (row: TData) => string;
}) => {
  const table = useTable({
    columns,
    data,
    features: dataTableFeatures,
    getRowId,
  });
  let rows: ReactNode;
  if (loadingRowCount !== undefined) {
    rows = Array.from({ length: loadingRowCount }, (_, index) => (
      <TableRow aria-hidden="true" className="h-12" key={`loading-${index}`}>
        {table.getAllLeafColumns().map((column) => (
          <TableCell key={column.id}>
            <Skeleton
              className={column.id === "email" ? "h-4 w-44" : "h-4 w-24"}
            />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (table.getRowModel().rows.length) {
    rows = table.getRowModel().rows.map((row) => (
      <TableRow className="relative h-12" key={row.id}>
        {row.getAllCells().map((cell, index) => (
          <TableCell key={cell.id}>
            {getRowHref && index === 0 ? (
              <Link
                className="focus-visible:after:ring-ring outline-hidden after:absolute after:inset-0 after:z-10 focus-visible:after:ring-2 focus-visible:after:ring-inset"
                href={getRowHref(row.original)}
              >
                <table.FlexRender cell={cell} />
              </Link>
            ) : (
              <table.FlexRender cell={cell} />
            )}
          </TableCell>
        ))}
      </TableRow>
    ));
  } else {
    rows = (
      <TableRow>
        <TableCell className="h-24 text-center" colSpan={columns.length}>
          {empty}
        </TableCell>
      </TableRow>
    );
  }
  return (
    <div
      aria-busy={isFetching}
      className="overflow-hidden rounded-md border [&_tr>:first-child]:pl-4 [&_tr>:last-child]:pr-4"
    >
      <Table aria-label={label}>
        <TableCaption className="sr-only">
          {label}
          {loadingRowCount === undefined ? null : (
            <output aria-label={`Fetching ${label.toLowerCase()}`} />
          )}
        </TableCaption>
        {/* eslint-disable-next-line shadcn/no-restyle, shadcn/no-raw-colors -- The requested data-table design uses gray-50 explicitly and retains it on hover. */}
        <TableHeader className="bg-gray-50 [&_tr]:hover:bg-transparent">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const sortable = sortableColumns.includes(header.column.id);
                const sorted = sortBy === header.column.id;
                let SortIcon = ArrowUpDown;
                let ariaSort: "none" | "ascending" | "descending" | undefined;
                if (sortable) {
                  ariaSort = "none";
                  if (sorted) {
                    ariaSort =
                      sortDirection === "asc" ? "ascending" : "descending";
                    SortIcon = sortDirection === "asc" ? ArrowUp : ArrowDown;
                  }
                }
                /* eslint-disable shadcn/no-restyle -- Data-table headers intentionally use muted text, including sort buttons, while retaining table alignment and transparent button surfaces. */
                return (
                  <TableHead
                    aria-sort={ariaSort}
                    className="text-muted-foreground"
                    key={header.id}
                  >
                    {sortable ? (
                      <Button
                        className="text-muted-foreground hover:text-muted-foreground border-0 px-0 hover:bg-transparent dark:hover:bg-transparent"
                        onClick={() => onSortChange(header.column.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <table.FlexRender header={header} />
                        <SortIcon
                          aria-hidden="true"
                          className="text-muted-foreground size-3.5"
                        />
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
                /* eslint-enable shadcn/no-restyle */
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>{rows}</TableBody>
      </Table>
    </div>
  );
};

export { DataTable, dataTableFeatures };
