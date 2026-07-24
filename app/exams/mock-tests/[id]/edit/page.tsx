import { notFound } from "next/navigation";
import { getMockTestDraftForEdit, listBlueprintTemplates, listTestKinds } from "@/app/lib/examData";
import ExamDesigner from "@/app/exams/mock-tests/new/ExamDesigner";

export const metadata = { title: "Edit Exam · Question Bank" };
export const dynamic = "force-dynamic";

export default async function EditMockTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, templates, testKinds] = await Promise.all([
    getMockTestDraftForEdit(id),
    listBlueprintTemplates(),
    listTestKinds(),
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
      />
    </div>
  );
}
