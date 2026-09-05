import { listTestKinds } from "@/app/lib/exams/data";
import TemplateDesigner from "./TemplateDesigner";

export const metadata = { title: "Design Template · Question Bank" };
export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const testKinds = await listTestKinds();

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <TemplateDesigner testKinds={testKinds} />
    </div>
  );
}
