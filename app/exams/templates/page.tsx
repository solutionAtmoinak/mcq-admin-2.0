import Link from "next/link";
import { listBlueprintTemplates } from "@/app/lib/examData";
import { primaryButtonClass, buttonClass } from "@/app/components/ui";

export const metadata = { title: "Exam Templates · Question Bank" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listBlueprintTemplates();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Exam templates</h1>
        <Link href="/exams/templates/new" className={primaryButtonClass}>
          Design template
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {templates.map((t) => {
          const summary = t.filterJson.summary;
          return (
            <div key={t.templateId} className="rounded-xl border border-zinc-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-800">{t.name}</div>
                  <div className="text-xs text-zinc-400">
                    {t.filterJson.testKind?.name ?? "Mock Test"} ·{" "}
                    {summary ? `${summary.totalQuestions} questions · ${summary.totalMarks} marks · ${summary.durationMin} min` : t.filterJson.examPaper.Name}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/exams/templates/new?copyFrom=${t.templateId}`} className={buttonClass}>
                    Copy
                  </Link>
                  <Link href={`/exams/mock-tests/new?template=${t.templateId}`} className={buttonClass}>
                    Use
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {!templates.length && <p className="text-sm text-zinc-400">No templates yet — design one to get started.</p>}
      </div>
    </div>
  );
}
