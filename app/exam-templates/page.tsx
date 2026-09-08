import Link from "next/link";
import { FiAward, FiClock, FiFileText, FiHash, FiLayers, FiShield } from "react-icons/fi";
import { listBlueprintTemplates } from "@/app/lib/exams/data";
import { primaryButtonClass, buttonClass } from "@/app/components/common/ui";
import DeleteTemplateButton from "@/app/components/exams/DeleteTemplateButton";

export const metadata = { title: "Exam Templates · Question Bank" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listBlueprintTemplates();

  return (
    <div className="mx-auto w-full max-w-none px-6 py-8 xl:px-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Exam templates</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            {templates.length ? `${templates.length} template${templates.length === 1 ? "" : "s"}` : "Reusable exam shapes"}
          </p>
        </div>
        <Link href="/exam-templates/new" className={primaryButtonClass}>
          Design template
        </Link>
      </div>

      {templates.length ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => {
            const summary = t.filterJson.summary;
            const sectionCount = t.filterJson.paperSections.length;
            const stats = [
              { icon: FiHash, value: summary?.totalQuestions ?? "—", label: "Questions" },
              { icon: FiAward, value: summary?.totalMarks ?? "—", label: "Marks" },
              { icon: FiClock, value: summary ? `${summary.durationMin}m` : "—", label: "Duration" },
            ];

            return t.isOwner ? (
              <div
                key={t.templateId}
                className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
                      <FiFileText size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-900" title={t.name}>
                        {t.name}
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-zinc-400">
                        <FiLayers size={11} />
                        {t.filterJson.testKind?.name ?? "Mock Test"} · {sectionCount} section{sectionCount === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3">
                    {stats.map(({ icon: Icon, value, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1 text-center">
                        <Icon size={13} className="text-zinc-400" />
                        <div className="text-sm font-semibold text-zinc-800">{value}</div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
                  <Link href={`/exam-templates/${t.templateId}`} className={`${buttonClass} flex-1 text-center`}>
                    Edit
                  </Link>
                  <DeleteTemplateButton templateId={t.templateId} templateName={t.name} />
                </div>
              </div>
            ) : (
              <div
                key={t.templateId}
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-zinc-900/20"
              >
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-900">
                  <FiShield size={10} fill="true" className="text-slate-600" /> Master
                </span>

                <div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-600 text-white">
                      <FiFileText size={17} />
                    </span>
                    <div className="min-w-0 pr-16">
                      <div className="truncate text-black font-semibold" title={t.name}>
                        {t.name}
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-zinc-400">
                        <FiLayers size={11} />
                        {t.filterJson.testKind?.name ?? "Mock Test"} · {sectionCount} section{sectionCount === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-900 p-3">
                    {stats.map(({ icon: Icon, value, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1 text-center">
                        <Icon size={13} className="text-zinc-500" />
                        <div className="text-sm font-semibold text-zinc-100">{value}</div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 border-t border-zinc-800 pt-3 text-center text-xs font-medium text-zinc-500">
                  Master templates cannot be edited or deleted.
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 text-zinc-500">
            <FiFileText size={20} />
          </span>
          <p className="text-sm text-zinc-500">No templates yet — design one to get started.</p>
          <Link href="/exam-templates/new" className={primaryButtonClass}>
            Design template
          </Link>
        </div>
      )}
    </div>
  );
}
