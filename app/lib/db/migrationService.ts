"use server";

import { callStoredProcedure } from "@/app/lib/db/executor";

// Thin wrapper binding the shared executor to dbo.spMcqMigrationService — a
// dedicated stored procedure for one-off migration work (Mode 1:
// extractBySectionId, Mode 2: createQuestionsBulk), kept separate from the
// production dbo.spMcqTeacherService. See
// mcq-admin/sql/spMcqMigrationService.sql for the full per-mode contract and
// executor.ts for the actual HTTP/envelope handling shared with
// teacherService.ts's callTeacherService.
export async function callMigrationService<T>(
  mode: number,
  params?: Record<string, unknown>,
): Promise<T | undefined> {
  return callStoredProcedure<T>("spMcqMigrationService", mode, params);
}
