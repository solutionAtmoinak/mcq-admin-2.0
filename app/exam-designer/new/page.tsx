import { listBlueprintTemplates, listTestKinds } from "@/app/lib/examData";
import { getServiceOptions } from "@/app/lib/serviceConfig";
import ExamDesigner from "./ExamDesigner";

export const metadata = { title: "Create Exam · Question Bank" };
export const dynamic = "force-dynamic";

export default async function NewMockTestPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const [{ template }, templates, testKinds, examStatusOptions] = await Promise.all([
    searchParams,
    listBlueprintTemplates(),
    listTestKinds(),
    getServiceOptions("EXAM_STATUS"),
  ]);

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <ExamDesigner
        templates={templates}
        testKinds={testKinds}
        initialTemplateId={template ?? null}
        examStatusOptions={examStatusOptions}
      />
    </div>
  );
}
