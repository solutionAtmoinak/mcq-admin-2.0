import { BackLink } from "@/app/components/common/BackLink";
import MockTestStatusBadge from "@/app/components/exams/MockTestStatusBadge";
import QuestionPickWorkspace from "@/app/components/exams/QuestionPickWorkspace";
import { iconTextButtonClass } from "@/app/components/common/ui";
import { getReferenceData, listQuestionLots } from "@/app/lib/questions/data";
import { getMockTestForEdit } from "@/app/lib/exams/data";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";
import { valueByLabel } from "@/app/lib/db/serviceOptions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FiEdit2 } from "react-icons/fi";

export const metadata = { title: "Pick Questions · Question Bank" };
export const dynamic = "force-dynamic";

export default async function QuestionPickPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [mockTest, referenceData, lots, examStatusOptions] = await Promise.all([
    getMockTestForEdit(id),
    getReferenceData(),
    listQuestionLots(),
    getServiceOptions("EXAM_STATUS"),
  ]);
  if (!mockTest) notFound();
  const draftStatusValue = valueByLabel(examStatusOptions, "DRAFT");

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <BackLink href="/exam-designer" label="All exams" />

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">{mockTest.name}</h1>
        <div className="flex items-center gap-2">
          {mockTest.status === draftStatusValue && (
            <Link href={`/exam-designer/${mockTest.mockTestId}`} className={iconTextButtonClass}>
              <FiEdit2 size={13} /> Edit
            </Link>
          )}
          <MockTestStatusBadge
            mockTestId={mockTest.mockTestId}
            examName={mockTest.name}
            status={mockTest.status}
            examStatusOptions={examStatusOptions}
          />
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {mockTest.code} · {mockTest.paperName} · {mockTest.totalMarks} marks · {mockTest.durationMin} min
      </p>

      <div className="mt-6">
        <QuestionPickWorkspace
          mockTest={mockTest}
          referenceData={referenceData}
          lots={lots}
          examStatusOptions={examStatusOptions}
        />
      </div>
    </div>
  );
}
