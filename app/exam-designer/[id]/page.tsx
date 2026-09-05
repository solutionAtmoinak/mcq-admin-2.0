import { notFound } from "next/navigation";
import { getMockTestDraftForEdit, listBlueprintTemplates, listTestKinds } from "@/app/lib/exams/data";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";
import ExamDesigner from "@/app/exam-designer/new/ExamDesigner";

export const metadata = { title: "Edit Exam · Question Bank" };
export const dynamic = "force-dynamic";

export default async function EditMockTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, templates, testKinds, examStatusOptions] = await Promise.all([
    getMockTestDraftForEdit(id),
    listBlueprintTemplates(),
    listTestKinds(),
    getServiceOptions("EXAM_STATUS"),
  ]);
  if (!data) notFound();

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <ExamDesigner
        templates={templates}
        testKinds={testKinds}
        mode="edit"
        mockTestId={data.mockTestId}
        initialExamName={data.draft.name}
        initialDraft={data.draft}
        initialStatus={data.status}
        pickedBySectionId={data.pickedBySectionId}
        examStatusOptions={examStatusOptions}
      />
    </div>
  );
}
