import DeleteQuestionButton from "@/app/components/questions/DeleteQuestionButton";
import { FilterSelectPicker } from "@/app/components/common/FilterSelectPicker";
import QuestionStatusBadge from "@/app/components/questions/QuestionStatusBadge";
import { DataTable } from "@/app/components/table/DataTable";
import { TagFilterPicker } from "@/app/components/questions/TagFilterPicker";
import { PAGE_SIZE_OPTIONS } from "@/app/lib/shared/constants";
import { getReferenceData, listQuestions } from "@/app/lib/questions/data";
import { QUESTION_TYPE_LABELS, type QuestionTypeCode } from "@/app/lib/questions/schema";
import { toLabelRecord } from "@/app/lib/db/serviceOptions";
import Link from "next/link";
import { FiSearch } from "react-icons/fi";

export const metadata = { title: "Question Bank" };
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  type?: string;
  difficulty?: string;
  tagKey?: string | string[];
  tagValue?: string | string[];
  status?: string;
  page?: string;
  pageSize?: string;
};

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const referenceData = await getReferenceData();
  const difficultyLabels = toLabelRecord(referenceData.difficultyOptions);

  const typeId = params.type ? Number(params.type) : undefined;
  const difficulty = params.difficulty ? Number(params.difficulty) : undefined;
  const status = params.status !== undefined && params.status !== "" ? Number(params.status) : undefined;
  const page = params.page ? Math.max(1, Number(params.page)) : 1;
  const requestedPageSize = params.pageSize ? Number(params.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;
  const tagKeys = toArray(params.tagKey).map((s) => s.trim()).filter(Boolean);
  const tagValues = toArray(params.tagValue).map((s) => s.trim()).filter(Boolean);

  const { items, total } = await listQuestions({
    q: params.q?.trim() || undefined,
    typeId,
    difficulty,
    tagKeys,
    tagValues,
    status,
    page,
    pageSize,
  });

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Question Bank</h1>
          <p className="mt-1 text-sm text-zinc-500">{total} question(s) total</p>
        </div>
        <Link
          href="/questions/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          + Create Questions
        </Link>
      </div>

      <form
        method="GET"
        className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-4 lg:grid-cols-7"
      >

        <FilterSelectPicker
          name="type"
          placeholder="All types"
          defaultValue={typeId ?? null}
          data={referenceData.questionTypes.map((t) => ({
            label: QUESTION_TYPE_LABELS[t.code as QuestionTypeCode] ?? t.name,
            value: t.id,
          }))}
        />
        <FilterSelectPicker
          name="difficulty"
          placeholder="All difficulties"
          defaultValue={difficulty ?? null}
          data={referenceData.difficultyOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
        />
        <FilterSelectPicker
          name="status"
          placeholder="All statuses"
          defaultValue={status ?? null}
          data={referenceData.questionStatusOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
        />

        <TagFilterPicker
          referenceData={referenceData}
          defaultKeys={tagKeys}
          defaultValues={tagValues}
        />


        <div className="lg:col-span-2 flex gap-x-2">
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search question or option text…"
            className="col-span-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm lg:col-span-1 w-full"
          />

          <button
            type="submit"
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-700 sm:col-span-1 w-fit"
          >
            <FiSearch size={14} />
            Search
          </button>
        </div>
      </form>

      <DataTable
        pagination={{
          basePath: "/questions",
          searchParams: params,
          page,
          pageSize,
          total,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          entityLabel: "questions",
        }}
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Stem</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Difficulty</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Tags</th>
              <th className="px-4 py-2">Lot</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((q) => (
              <tr key={q.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/questions/${q.id}`} className="text-zinc-900 underline">
                    {q.code}
                  </Link>
                </td>
                <td className="max-w-md truncate px-4 py-2 text-zinc-700">
                  {q.stemPreview}
                </td>
                <td className="px-4 py-2 text-zinc-500">{q.typeName}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {difficultyLabels[q.difficulty] ?? q.difficulty}
                </td>
                <td className="px-4 py-2">
                  <QuestionStatusBadge
                    questionId={q.id}
                    questionCode={q.code}
                    status={q.status}
                    statusOptions={referenceData.questionStatusOptions}
                  />
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {q.tagNames.slice(0, 3).join(", ")}
                  {q.tagNames.length > 3 ? "…" : ""}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-500" title={q.lotNo ?? undefined}>
                  {q.lotNo ?? "—"}
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {new Date(q.createdOn).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  <DeleteQuestionButton questionId={q.id} questionCode={q.code} />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">
                  No questions match these filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
