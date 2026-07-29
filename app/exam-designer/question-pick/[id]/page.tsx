import { notFound } from "next/navigation";
import Link from "next/link";
import { FiEdit2 } from "react-icons/fi";
import { getMockTestForEdit } from "@/app/lib/examData";
import { getReferenceData, listQuestionLots } from "@/app/lib/data";
import { iconTextButtonClass } from "@/app/components/ui";
import MockTestStatusBadge from "@/app/components/exams/MockTestStatusBadge";
import QuestionPickWorkspace from "@/app/components/exams/QuestionPickWorkspace";
import { MOCK_TEST_STATUS } from "@/app/lib/examConstants";

export const metadata = { title: "Pick Questions · Question Bank" };
export const dynamic = "force-dynamic";

export default async function QuestionPickPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [mockTest, referenceData, lots] = await Promise.all([
    getMockTestForEdit(id),
    getReferenceData(),
    listQuestionLots(),
  ]);
  if (!mockTest) notFound();

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <Link href="/exam-designer" className="text-sm text-zinc-500 hover:underline">
        ← All exams
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">{mockTest.name}</h1>
        <div className="flex items-center gap-2">
          {mockTest.status === MOCK_TEST_STATUS.DRAFT && (
            <Link href={`/exam-designer/${mockTest.mockTestId}`} className={iconTextButtonClass}>
              <FiEdit2 size={13} /> Edit
            </Link>
          )}
          <MockTestStatusBadge mockTestId={mockTest.mockTestId} examName={mockTest.name} status={mockTest.status} />
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {mockTest.code} · {mockTest.paperName} · {mockTest.totalMarks} marks · {mockTest.durationMin} min
      </p>

      <div className="mt-6">
        <QuestionPickWorkspace mockTest={mockTest} referenceData={referenceData} lots={lots} />
      </div>
    </div>
  );
}
