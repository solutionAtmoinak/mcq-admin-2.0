import { callTeacherService } from "@/app/lib/db/teacherService";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";

// Mode 34 of dbo.spMcqTeacherService — see mcq-admin/sql/spMcqTeacherService-deploy.sql.
type RawAnalytics = {
  TotalExams: number;
  TotalAttempts: number;
  TotalStudents: number;
  TotalLots: number;
  ExamsByStatus: { Status: number; Count: number }[] | null;
  TopExams: { Name: string; Code: string; Attempts: number; Students: number }[] | null;
  AttemptsByDay: { Day: string; Count: number }[] | null;
  Lots: { LotNo: string; CreatedOn: string; Count: number }[] | null;
  ByDifficulty: { Difficulty: number; Count: number }[] | null;
};

export type LabelledCount = {
  // Machine key from _InternalService (e.g. "PUBLISHED") — used only to pick
  // a presentation colour, never for logic.
  key: string;
  label: string;
  count: number;
};

export type DashboardAnalytics = {
  totalExams: number;
  totalAttempts: number;
  totalStudents: number;
  totalLots: number;
  examsByStatus: LabelledCount[];
  topExams: { name: string; code: string; attempts: number; students: number }[];
  // Every one of the last 14 days, zero-filled, oldest first.
  attemptsByDay: { day: string; count: number }[];
  // Oldest first (the SP returns newest first) so the chart reads left → right.
  lots: { lotNo: string; createdOn: string; count: number }[];
  byDifficulty: LabelledCount[];
};

const WINDOW_DAYS = 14;

function lastDays(rows: { Day: string; Count: number }[]) {
  const byDay = new Map(rows.map((r) => [r.Day, r.Count]));
  const out: { day: string; count: number }[] = [];
  const today = new Date();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [raw, examStatusOptions, difficultyOptions] = await Promise.all([
    callTeacherService<RawAnalytics | string>(34, {}),
    getServiceOptions("EXAM_STATUS"),
    getServiceOptions("QUESTION_DIFFICULTY"),
  ]);
  if (raw === undefined || typeof raw === "string") {
    throw new Error(typeof raw === "string" ? raw : "Failed to load dashboard analytics.");
  }

  const examCounts = new Map((raw.ExamsByStatus ?? []).map((r) => [r.Status, r.Count]));
  const diffCounts = new Map((raw.ByDifficulty ?? []).map((r) => [r.Difficulty, r.Count]));

  return {
    totalExams: raw.TotalExams,
    totalAttempts: raw.TotalAttempts,
    totalStudents: raw.TotalStudents,
    totalLots: raw.TotalLots,
    // Every configured status appears, including those with zero exams.
    examsByStatus: examStatusOptions.map((o) => ({
      key: o.label,
      label: o.displayLabel,
      count: examCounts.get(o.value) ?? 0,
    })),
    topExams: (raw.TopExams ?? []).map((e) => ({
      name: e.Name,
      code: e.Code,
      attempts: e.Attempts,
      students: e.Students,
    })),
    attemptsByDay: lastDays(raw.AttemptsByDay ?? []),
    lots: (raw.Lots ?? [])
      .map((l) => ({ lotNo: l.LotNo, createdOn: l.CreatedOn, count: l.Count }))
      .reverse(),
    byDifficulty: difficultyOptions.map((o) => ({
      key: o.label,
      label: o.displayLabel,
      count: diffCounts.get(o.value) ?? 0,
    })),
  };
}
