"use server";

import { revalidatePath } from "next/cache";
import { callTeacherService } from "@/app/lib/db/teacherService";

export type DeleteAttemptResult = { ok: true; answersDeleted: number } | { ok: false; error: string };

// Mode 47 — permanently deletes the attempt together with its selected
// answers, section progress and event log. The student can start the exam afresh.
export async function deleteExamAttempt(attemptId: string): Promise<DeleteAttemptResult> {
  const result = await callTeacherService<{ AnswersDeleted: number } | string>(47, { AttemptId: attemptId });
  if (typeof result === "string" || !result) {
    return { ok: false, error: typeof result === "string" ? result : "Failed to delete the attempt." };
  }
  revalidatePath("/attempts");
  return { ok: true, answersDeleted: result.AnswersDeleted };
}
