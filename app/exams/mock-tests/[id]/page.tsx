import { notFound } from "next/navigation";
import Link from "next/link";
import { FiEdit2 } from "react-icons/fi";
import { getMockTestForEdit } from "@/app/lib/examData";
import { cardClass, iconTextButtonClass, sectionLabelClass, subCardClass } from "@/app/components/ui";
import MockTestStatusBadge from "@/app/components/exams/MockTestStatusBadge";
import { MOCK_TEST_STATUS } from "@/app/lib/examConstants";

export const dynamic = "force-dynamic";

export default async function MockTestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mockTest = await getMockTestForEdit(id);
  if (!mockTest) notFound();

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <Link href="/exams/mock-tests" className="text-sm text-zinc-500 hover:underline">
        ← All exams
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">{mockTest.name}</h1>
        <div className="flex items-center gap-2">
          {mockTest.status === MOCK_TEST_STATUS.DRAFT && (
            <Link href={`/exams/mock-tests/${mockTest.mockTestId}/edit`} className={iconTextButtonClass}>
              <FiEdit2 size={13} /> Edit
            </Link>
          )}
          <MockTestStatusBadge mockTestId={mockTest.mockTestId} examName={mockTest.name} status={mockTest.status} />
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {mockTest.code} · {mockTest.paperName} · {mockTest.totalMarks} marks · {mockTest.durationMin} min
      </p>

      <div className={`${cardClass} mt-6`}>
        <div className={sectionLabelClass}>Sections</div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {mockTest.sections.map((s) => (
            <div key={s.sectionId} className={subCardClass}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-800">{s.name}</span>
                <span className="font-mono text-sm text-zinc-600">
                  {s.picked} / {s.pool} picked
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {s.mandatory} of {s.pool} mandatory to attempt · {s.questionType}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          Question picker (tag filter + lot filter) and publish come next — this draft is saved and ready for it.
        </p>
      </div>
    </div>
  );
}
