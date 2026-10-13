import Link from "next/link";
import { FiEye, FiSearch } from "react-icons/fi";
import { DataTable } from "@/app/components/table/DataTable";
import { inputClass } from "@/app/components/common/ui";
import { listQuestionLotsPaged } from "@/app/lib/questions/data";
import { PAGE_SIZE_OPTIONS } from "@/app/lib/shared/constants";

export const metadata = { title: "Question Lots · Question Bank" };
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

type SearchParams = { q?: string; page?: string; pageSize?: string };

// Every batch of questions authored in one "Create Questions" sitting is a lot
// (see createQuestionLot). This lists them — lot no, when it was created and how
// many questions it holds — with a shortcut into the question bank filtered to
// that lot (the bank already preselects a lot from ?lotId=).
export default async function QuestionLotsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = params.page ? Math.max(1, Number(params.page) || 1) : 1;
  const requestedPageSize = params.pageSize ? Number(params.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;

  const { items, total } = await listQuestionLotsPaged(q, page, pageSize);

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Question Lots</h1>
          <p className="mt-1 text-sm text-zinc-500">{total} lot(s) with questions</p>
        </div>
        <Link
          href="/questions/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          + Create Questions
        </Link>
      </div>

      <form
        method="GET"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by lot number…"
          className={`${inputClass} max-w-xs`}
          autoComplete="off"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
        >
          <FiSearch size={14} />
          Search
        </button>
      </form>

      <DataTable
        pagination={{
          basePath: "/questions/lots",
          searchParams: params,
          page,
          pageSize,
          total,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          entityLabel: "lots",
        }}
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">Lot No</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Questions</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((lot) => (
              <tr key={lot.lotId} className="hover:bg-zinc-50">
                <td className="px-4 py-2 font-mono text-xs text-zinc-900">{lot.lotNo}</td>
                <td className="px-4 py-2 text-zinc-500">{new Date(lot.createdOn).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-zinc-700">{lot.questionCount}</td>
                <td className="px-4 py-2">
                  <Link
                    href={`/questions?lotId=${encodeURIComponent(lot.lotId)}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                    aria-label={`View questions in ${lot.lotNo}`}
                    title="View these questions in the question bank"
                  >
                    <FiEye size={14} />
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  No lots found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
