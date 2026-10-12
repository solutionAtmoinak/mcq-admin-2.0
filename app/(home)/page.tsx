import Link from "next/link";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAward,
  FiBookOpen,
  FiCheckCircle,
  FiHelpCircle,
  FiLayers,
  FiPlus,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { getBankSummary } from "@/app/lib/questions/data";
import { getDashboardAnalytics } from "@/app/lib/dashboard/data";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";
import {
  AttemptsAreaChart,
  DonutChart,
  LotColumnChart,
  SimpleBarChart,
  StatusBreakdown,
  TopExamsList,
} from "@/app/components/dashboard/DashboardCharts";
import { buttonClass, primaryIconTextButtonClass } from "@/app/components/common/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [summary, analytics, questionStatusOptions] = await Promise.all([
    getBankSummary(),
    getDashboardAnalytics(),
    getServiceOptions("QUESTION_STATUS"),
  ]);

  const questionStatus = questionStatusOptions.map((o) => ({
    key: o.label,
    label: o.displayLabel,
    count: summary.byStatus.find((s) => s.status === o.value)?.count ?? 0,
  }));
  const questionTypes = summary.byType.map((t) => ({ key: t.code, label: t.name, count: t.count }));
  const publishedExams = analytics.examsByStatus.find((s) => s.key === "PUBLISHED")?.count ?? 0;

  return (
    <div className="flex w-full flex-1 flex-col gap-6 px-6 py-8 xl:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your question bank, exams and student activity at a glance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/questions" className={buttonClass}>
            Browse Question Bank
          </Link>
          <Link href="/questions/new" className={primaryIconTextButtonClass}>
            <FiPlus size={15} /> Create Questions
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={FiHelpCircle} tone="indigo" label="Total questions" value={summary.total} />
        <Kpi icon={FiTrendingUp} tone="sky" label="Added last 7 days" value={summary.recentCount} />
        <Kpi icon={FiBookOpen} tone="violet" label="Total exams" value={analytics.totalExams} />
        <Kpi icon={FiCheckCircle} tone="emerald" label="Ongoing exams" value={publishedExams} />
        <Kpi icon={FiActivity} tone="amber" label="Student attempts" value={analytics.totalAttempts} />
        <Kpi icon={FiUsers} tone="rose" label="Active students" value={analytics.totalStudents} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Exams by status" subtitle="Published, draft and archived" className="xl:col-span-1">
          <DonutChart data={analytics.examsByStatus} totalLabel="Exams" emptyText="No exams created yet." />
        </Panel>
        <Panel
          title="Student attempts"
          subtitle="Attempts started per day, last 14 days"
          className="xl:col-span-2"
        >
          <AttemptsAreaChart data={analytics.attemptsByDay} />
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel
          title="Most attempted exams"
          subtitle="Top 10 by student attempts"
          className="xl:col-span-3"
        >
          <TopExamsList data={analytics.topExams} />
        </Panel>
        <Panel title="Question status" subtitle="Where your questions are in review" className="xl:col-span-2">
          <StatusBreakdown data={questionStatus} totalLabel="questions in the bank" emptyText="No questions yet." />
        </Panel>
      </section>

      <Panel
        title="Questions per lot"
        subtitle={`${analytics.lots.length} lots with questions, with the date each was created`}
        icon={FiLayers}
      >
        <LotColumnChart data={analytics.lots} />
      </Panel>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Questions by difficulty" subtitle="How balanced is the bank?">
          <SimpleBarChart data={analytics.byDifficulty} name="Questions" emptyText="No questions yet." />
        </Panel>
        <Panel title="Questions by type" subtitle="MCQ, multi-correct, integer and more">
          <SimpleBarChart data={questionTypes} name="Questions" emptyText="No questions yet." />
        </Panel>
      </section>
    </div>
  );
}

const TONES = {
  indigo: "bg-indigo-600/10 text-indigo-600 dark:text-indigo-300",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
} as const;

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: IconType;
  tone: keyof typeof TONES;
  label: string;
  value: number;
}) {
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-zinc-900">
          {value.toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon = FiAward,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: IconType;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 hidden h-8 w-1 rounded-full bg-brand sm:block" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <Icon size={16} className="ml-auto hidden shrink-0 text-zinc-300 sm:block" aria-hidden />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
