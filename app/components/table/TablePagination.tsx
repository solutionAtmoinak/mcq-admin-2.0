import Link from "next/link";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { PageSizeSelect } from "@/app/components/table/PageSizeSelect";

export type QueryParams = { [key: string]: string | string[] | undefined };

export type TablePaginationProps = {
  basePath: string;
  searchParams: QueryParams;
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: readonly number[];
  entityLabel?: string;
};

function buildHref(basePath: string, searchParams: QueryParams, overrides: QueryParams) {
  const usp = new URLSearchParams();
  const merged = { ...searchParams, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (Array.isArray(v)) {
      for (const item of v) if (item) usp.append(k, item);
    } else if (v) {
      usp.set(k, v);
    }
  }
  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// First, a window around the current page, and last — with ellipses for the
// gaps — so the pill row stays a fixed, glance-able width no matter how many
// pages there are.
function getPageWindow(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);

  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push("ellipsis");

  pages.push(totalPages);
  return pages;
}

const pillClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors";
const arrowClass = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors";

// Footer bar shared by every paginated table in the app: entry-range text,
// a page-size dropdown, and windowed page-number links. Everything except
// the page-size dropdown is a plain <Link> to a precomputed href, so this
// stays a server component apart from that one small client control.
export function TablePagination({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
  pageSizeOptions = [20, 50, 100],
  entityLabel = "entries",
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  const hrefFor = (overrides: QueryParams) => buildHref(basePath, searchParams, overrides);
  const pages = getPageWindow(page, totalPages);
  const hrefByPageSize = Object.fromEntries(
    pageSizeOptions.map((size) => [size, hrefFor({ pageSize: String(size), page: "1" })])
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
      <span>
        Showing {rangeStart} to {rangeEnd} of {total} {entityLabel}
      </span>

      <PageSizeSelect value={pageSize} options={pageSizeOptions} hrefByPageSize={hrefByPageSize} />

      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={hrefFor({ page: String(page - 1) })}
            className={`${arrowClass} text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900`}
            aria-label="Previous page"
          >
            <FiChevronLeft size={14} />
          </Link>
        ) : (
          <span className={`${arrowClass} text-zinc-300`}>
            <FiChevronLeft size={14} />
          </span>
        )}

        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`ellipsis-${i}`} className="px-1 text-zinc-400">
              …
            </span>
          ) : p === page ? (
            // Current page: no Link. A Link here would sit inside this
            // (fully dynamic, uncached) route's Suspense boundary, remount
            // on every navigation, and immediately re-prefetch the exact
            // URL already on screen — see TablePagination self-link loop.
            <span key={p} className={`${pillClass} bg-zinc-900 text-white`} aria-current="page">
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={hrefFor({ page: String(p) })}
              className={`${pillClass} text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900`}
            >
              {p}
            </Link>
          )
        )}

        {page < totalPages ? (
          <Link
            href={hrefFor({ page: String(page + 1) })}
            className={`${arrowClass} text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900`}
            aria-label="Next page"
          >
            <FiChevronRight size={14} />
          </Link>
        ) : (
          <span className={`${arrowClass} text-zinc-300`}>
            <FiChevronRight size={14} />
          </span>
        )}
      </div>
    </div>
  );
}
