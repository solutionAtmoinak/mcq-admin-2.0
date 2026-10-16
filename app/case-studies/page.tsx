import { FiSearch } from "react-icons/fi";
import { CaseStudyRowActions, NewCaseStudyButton } from "@/app/components/questions/CaseStudyManage";
import { DataTable } from "@/app/components/table/DataTable";
import { inputClass } from "@/app/components/common/ui";
import { listCaseStudies } from "@/app/lib/questions/data";
import { PAGE_SIZE_OPTIONS } from "@/app/lib/shared/constants";

export const metadata = { title: "Case Studies · Question Bank" };
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

type SearchParams = { q?: string; page?: string; pageSize?: string };

// Every shared paragraph questions of kind "Case Study" point at. Create one here
// (or while writing a question), read it, edit it — every edit is saved as a new
// version, so exams already built keep the text they were built with — and delete
// it, which is refused while any question or exam still uses it.
export default async function CaseStudiesPage({
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

  const { items, total } = await listCaseStudies(q, page, pageSize);

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Case Studies</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total} case stud{total === 1 ? "y" : "ies"} — one paragraph shared by many questions. The title is for
            searching only; students see just the paragraph.
          </p>
        </div>
        <NewCaseStudyButton />
      </div>

      <form
        method="GET"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by title, code or words in the paragraph…"
          className={`${inputClass} max-w-md`}
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
          basePath: "/case-studies",
          searchParams: params,
          page,
          pageSize,
          total,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          entityLabel: "case studies",
        }}
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Paragraph</th>
              <th className="px-4 py-2">Questions</th>
              <th className="px-4 py-2">Version</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Last updated</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((c) => {
              const title = c.title?.trim() || "Untitled case study";
              return (
                <tr key={c.groupId} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 align-top">
                    <div className="font-medium text-zinc-900">{title}</div>
                    {c.code && <div className="font-mono text-[10px] text-zinc-400">{c.code}</div>}
                  </td>
                  <td className="max-w-md px-4 py-2 align-top text-xs text-zinc-600">
                    <p className="line-clamp-2">{c.preview}</p>
                  </td>
                  <td className="px-4 py-2 align-top text-zinc-700">
                    {c.questionCount}
                    {c.examCount > 0 && (
                      <div className="text-[10px] text-zinc-400">
                        in {c.examCount} exam{c.examCount === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top text-zinc-700">v{c.versionNo}</td>
                  <td className="px-4 py-2 align-top text-zinc-500">{new Date(c.createdOn).toLocaleDateString()}</td>
                  <td className="px-4 py-2 align-top text-zinc-500">
                    {c.modifiedOn ? new Date(c.modifiedOn).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <CaseStudyRowActions
                      groupId={c.groupId}
                      title={title}
                      versionNo={c.versionNo}
                      questionCount={c.questionCount}
                      examCount={c.examCount}
                    />
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  {q ? "No case studies match that search." : "No case studies yet — use “New case study”."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
