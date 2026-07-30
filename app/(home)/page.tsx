import { getBankSummary } from "@/app/lib/data";
import { getServiceOptions } from "@/app/lib/serviceConfig";
import { toLabelRecord } from "@/app/lib/serviceOptions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {

  const [summary, questionStatusOptions] = await Promise.all([
    getBankSummary(),
    getServiceOptions("QUESTION_STATUS"),
  ]);
  const questionStatusLabels = toLabelRecord(questionStatusOptions);

  return (
    <div className="flex w-full flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold text-zinc-900">Question Bank</h1>
        <p className="mt-2 text-zinc-500">
          Build and manage the MCQ / theory question bank behind your exams.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/questions/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          + Create Questions
        </Link>
        <Link
          href="/questions"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Browse Question Bank
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total questions" value={summary.total} />
        <StatCard label="Added last 7 days" value={summary.recentCount} />
        {summary.byStatus.map((s) => (
          <StatCard
            key={s.status}
            label={questionStatusLabels[s.status] ?? `Status ${s.status}`}
            value={s.count}
          />
        ))}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Questions by type
        </h2>
        <div className="flex flex-col gap-2">
          {summary.byType.map((t) => (
            <div key={t.code} className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">{t.name}</span>
              <span className="font-mono text-zinc-500">{t.count}</span>
            </div>
          ))}
          {summary.byType.length === 0 && (
            <p className="text-sm text-zinc-400">No question types configured yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
