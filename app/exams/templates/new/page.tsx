import { listBlueprintTemplates, listTestKinds } from "@/app/lib/examData";
import TemplateDesigner from "./TemplateDesigner";

export const metadata = { title: "Design Template · Question Bank" };
export const dynamic = "force-dynamic";

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ copyFrom?: string }>;
}) {
  const { copyFrom } = await searchParams;
  const [templates, testKinds] = await Promise.all([listBlueprintTemplates(), listTestKinds()]);

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <TemplateDesigner existingTemplates={templates} testKinds={testKinds} initialCopyFromTemplateId={copyFrom ?? null} />
    </div>
  );
}
