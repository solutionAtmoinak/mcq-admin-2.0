import { FiSearch } from "react-icons/fi";
import DeleteAttemptButton from "@/app/components/exams/DeleteAttemptButton";
import { FilterSelectPicker } from "@/app/components/common/FilterSelectPicker";
import { DataTable } from "@/app/components/table/DataTable";
import { PAGE_SIZE_OPTIONS } from "@/app/lib/shared/constants";
import { listExamAttempts, listExamOptions, type AttemptStatusFilter } from "@/app/lib/attempts/data";

export const metadata = { title: "Exam Attempts · Question Bank" };
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

type SearchParams = { exam?: string; status?: string; page?: string; pageSize?: string };

const STATUS_OPTIONS: { label: string; value: AttemptStatusFilter }[] = [
  { label: "Attempted (not submitted)", value: "attempted" },
  { label: "Submitted", value: "submitted" },
];

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

// Every student attempt on the franchise's own exams: which exam, who, when it
// was started, when (if) it was submitted and the marks once submitted. Filter by
// exam and by status — attempted (started, not submitted yet), submitted, or all.
export default async function ExamAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const exams = await listExamOptions();

  const mockTestId = exams.some((e) => e.mockTestId === params.exam) ? params.exam : undefined;
  const status = STATUS_OPTIONS.find((o) => o.value === params.status)?.value;
  const page = params.page ? Math.max(1, Number(params.page) || 1) : 1;
  const requestedPageSize = params.pageSize ? Number(params.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;

  const { items, total } = await listExamAttempts({ mockTestId, status, page, pageSize });

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Exam Attempts</h1>
        <p className="mt-1 text-sm text-zinc-500">{total} attempt(s)</p>
      </div>

      <form
        method="GET"
        className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-3"
      >
        <FilterSelectPicker
          name="exam"
          placeholder="All exams"
          defaultValue={mockTestId ?? null}
          data={exams.map((e) => ({ label: e.name, value: e.mockTestId }))}
        />
        <FilterSelectPicker
          name="status"
          placeholder="All statuses"
          defaultValue={status ?? null}
          data={STATUS_OPTIONS}
        />
        <button
          type="submit"
          className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
        >
          <FiSearch size={14} />
          Search
        </button>
      </form>

      <DataTable
        pagination={{
          basePath: "/attempts",
          searchParams: params,
          page,
          pageSize,
          total,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          entityLabel: "attempts",
        }}
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">Exam</th>
              <th className="px-4 py-2">Exam type</th>
              <th className="px-4 py-2">Student</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Attempt date</th>
              <th className="px-4 py-2">Submit date</th>
              <th className="px-4 py-2">Marks</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((a) => (
              <tr key={a.attemptId} className="hover:bg-zinc-50">
                <td className="px-4 py-2">
                  <div className="font-medium text-zinc-900">{a.examName}</div>
                  <div className="font-mono text-[11px] text-zinc-400">{a.examCode}</div>
                </td>
                <td className="px-4 py-2 text-zinc-500">{a.examType}</td>
                <td className="px-4 py-2 text-zinc-700" title={a.studentId}>
                  {a.studentName ?? <span className="font-mono text-xs">{a.studentId}</span>}
                </td>
                <td className="px-4 py-2 text-zinc-600">{a.studentEmail ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{a.studentPhone ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-500">{formatDateTime(a.startedOn)}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {a.submittedOn ? formatDateTime(a.submittedOn) : <span className="text-zinc-400">Not submitted</span>}
                </td>
                <td className="px-4 py-2 text-zinc-700">
                  {a.submittedOn && a.score !== null ? `${a.score} / ${a.totalMarks}` : "—"}
                </td>
                <td className="px-4 py-2">
                  <DeleteAttemptButton
                    attemptId={a.attemptId}
                    examName={a.examName}
                    studentLabel={a.studentName ?? a.studentId}
                    submitted={!!a.submittedOn}
                  />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">
                  No attempts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
