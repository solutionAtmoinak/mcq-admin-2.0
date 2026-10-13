import { callTeacherService } from "@/app/lib/db/teacherService";

// Exam-attempts report — Modes 45/46 of dbo.spMcqTeacherService.

function assertOk<T>(result: T | string | undefined, fallback: string): T {
  if (result === undefined || typeof result === "string") {
    throw new Error(typeof result === "string" ? result : fallback);
  }
  return result;
}

export type AttemptStatusFilter = "attempted" | "submitted";

export type ExamAttemptItem = {
  attemptId: string;
  mockTestId: string;
  examName: string;
  examCode: string;
  // The exam's test kind, e.g. "Mock Test", "Practice".
  examType: string;
  studentId: string;
  // Null until the SP looks the name up in the LMS database — show studentId then.
  studentName: string | null;
  studentEmail: string | null;
  studentPhone: string | null;
  startedOn: string;
  submittedOn: string | null;
  // Only present for a submitted attempt.
  score: number | null;
  totalMarks: number;
};

type RawAttempt = {
  AttemptId: string;
  MockTestId: string;
  ExamName: string;
  ExamCode: string;
  ExamType: string;
  StudentId: string;
  StudentName: string | null;
  StudentEmail: string | null;
  StudentPhone: string | null;
  StartedOn: string;
  SubmittedOn: string | null;
  ScoreTotal: number | null;
  TotalMarks: number;
};

type RawAttemptList = { Total: number; Items: RawAttempt[] | null };

export async function listExamAttempts(filters: {
  mockTestId?: string;
  status?: AttemptStatusFilter;
  page: number;
  pageSize: number;
}): Promise<{ items: ExamAttemptItem[]; total: number }> {
  const result = assertOk(
    await callTeacherService<RawAttemptList | string>(45, {
      MockTestId: filters.mockTestId ?? null,
      Status: filters.status ?? null,
      Page: filters.page,
      PageSize: filters.pageSize,
    }),
    "Failed to load exam attempts.",
  );

  return {
    items: (result.Items ?? []).map((a) => ({
      attemptId: a.AttemptId,
      mockTestId: a.MockTestId,
      examName: a.ExamName,
      examCode: a.ExamCode,
      examType: a.ExamType,
      studentId: a.StudentId,
      studentName: a.StudentName,
      studentEmail: a.StudentEmail,
      studentPhone: a.StudentPhone,
      startedOn: a.StartedOn,
      submittedOn: a.SubmittedOn,
      score: a.ScoreTotal,
      totalMarks: a.TotalMarks,
    })),
    total: result.Total ?? 0,
  };
}

export type ExamOption = { mockTestId: string; name: string; code: string };

export async function listExamOptions(): Promise<ExamOption[]> {
  // An empty list comes back as a null response.
  const rows = assertOk(
    await callTeacherService<{ MockTestId: string; Name: string; Code: string }[] | null | string>(46, {}),
    "Failed to load exams.",
  );
  return (rows ?? []).map((e) => ({ mockTestId: e.MockTestId, name: e.Name, code: e.Code }));
}
