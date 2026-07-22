import type { ReactNode } from "react";
import { TablePagination, type TablePaginationProps } from "@/app/components/table/TablePagination";

// Shared shell for every paginated admin table: a bordered card holding the
// caller's <table> markup on top and the dark TablePagination footer below,
// so every list page in the app gets the same look for free.
export function DataTable({
  children,
  pagination,
}: {
  children: ReactNode;
  pagination: TablePaginationProps;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <div className="overflow-x-auto">{children}</div>
      <TablePagination {...pagination} />
    </div>
  );
}
