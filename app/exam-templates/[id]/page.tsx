import { notFound } from "next/navigation";
import { getBlueprintTemplateForEdit, listTestKinds } from "@/app/lib/examData";
import TemplateDesigner from "@/app/exam-templates/new/TemplateDesigner";

export const metadata = { title: "Edit Template · Question Bank" };
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, testKinds] = await Promise.all([getBlueprintTemplateForEdit(id), listTestKinds()]);
  if (!data) notFound();

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <TemplateDesigner testKinds={testKinds} mode="edit" templateId={data.templateId} initialDraft={data.draft} />
    </div>
  );
}
