"use server";

import { callStoredProcedure } from "@/app/lib/db/executor";

// Thin wrapper binding the shared executor to dbo.spMcqTeacherService — the
// replacement for every Prisma call in app/lib/exams and app/lib/questions;
// new modes get added to mcq-admin/sql/spMcqTeacherService-deploy.sql as each
// Prisma query is migrated. See executor.ts for the actual HTTP/envelope
// handling shared with migrationService.ts's callMigrationService.
export async function callTeacherService<T>(
  mode: number,
  params?: Record<string, unknown>,
): Promise<T | undefined> {
  return callStoredProcedure<T>("spMcqTeacherService", mode, params);
}
