import { listBlueprintTemplates, listTestKinds } from "@/app/lib/examData";
import ExamDesigner from "./ExamDesigner";

export const metadata = { title: "Create Exam · Question Bank" };
export const dynamic = "force-dynamic";

export default async function NewMockTestPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const [{ template }, templates, testKinds] = await Promise.all([
    searchParams,
    listBlueprintTemplates(),
    listTestKinds(),
  ]);

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <ExamDesigner templates={templates} testKinds={testKinds} initialTemplateId={template ?? null} />
    </div>
  );
}
