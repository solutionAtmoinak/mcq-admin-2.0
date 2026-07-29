import DeleteMockTestButton from "@/app/components/exams/DeleteMockTestButton";
import MockTestStatusBadge from "@/app/components/exams/MockTestStatusBadge";
import { DataTable } from "@/app/components/table/DataTable";
import { iconButtonClass, iconTextButtonClass, primaryButtonClass } from "@/app/components/ui";
import { PAGE_SIZE_OPTIONS } from "@/app/lib/constants";
import { MOCK_TEST_STATUS } from "@/app/lib/examConstants";
import { listMockTests } from "@/app/lib/examData";
import Link from "next/link";
import { FiEdit2, FiPlusCircle } from "react-icons/fi";

export const metadata = { title: "Design Exam · Question Bank" };
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

export default async function MockTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const page = params.page ? Math.max(1, Number(params.page)) : 1;
  const requestedPageSize = params.pageSize ? Number(params.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;

  const { items, total } = await listMockTests({ page, pageSize });

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Design Exam</h1>
          <p className="mt-1 text-sm text-zinc-500">{total} exam(s) total</p>
        </div>
        <Link href="/exam-designer/new" className={primaryButtonClass}>
          + Design Exam
        </Link>
      </div>

      <DataTable
        pagination={{
          basePath: "/exam-designer",
          searchParams: params,
          page,
          pageSize,
          total,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          entityLabel: "exams",
        }}
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Paper</th>
              <th className="px-4 py-2">Marks</th>
              <th className="px-4 py-2">Duration</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((m) => (
              <tr key={m.mockTestId} className="hover:bg-zinc-50">
                <td className="px-4 py-2 font-medium text-zinc-800 ">
                  {m.name}
                  <div className="font-mono text-xs text-zinc-400">{m.code}</div>
                </td>
                <td className="px-4 py-2 text-zinc-600">{m.paperName}</td>
                <td className="px-4 py-2 text-zinc-600">{m.totalMarks}</td>
                <td className="px-4 py-2 text-zinc-600">{m.durationMin} min</td>
                <td className="px-4 py-2">
                  <MockTestStatusBadge mockTestId={m.mockTestId} examName={m.name} status={m.status} />
                </td>
                <td className="px-4 py-2 text-zinc-500">{new Date(m.createdOn).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/exam-designer/question-pick/${m.mockTestId}`}
                      className={iconTextButtonClass}
                      title="Add questions"
                    >
                      <FiPlusCircle size={13} /> Add Questions
                    </Link>
                    {m.status === MOCK_TEST_STATUS.DRAFT && (
                      <Link href={`/exam-designer/${m.mockTestId}`} className={iconButtonClass} title="Edit exam">
                        <FiEdit2 size={13} />
                      </Link>
                    )}
                    <DeleteMockTestButton mockTestId={m.mockTestId} examName={m.name} />
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  No exams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
