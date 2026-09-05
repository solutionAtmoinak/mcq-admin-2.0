// Status values (both the set of valid ones and what counts as "draft",
// "published", etc.) come from the DB (_InternalService, Category
// "EXAM_STATUS") at runtime — see app/lib/db/serviceConfig.ts's
// getServiceOptions/getServiceValue and app/lib/exams/actions.ts's
// getExamStatus(). Nothing here hardcodes which number means what.
//
// Badge colors have no DB column to come from, so this one lookup stays a
// fixed presentation-only palette, keyed by whatever numeric value the DB
// currently reports for each status.
export const MOCK_TEST_STATUS_BADGE: Record<number, string> = {
  0: "bg-amber-100 text-amber-800",
  1: "bg-emerald-100 text-emerald-700",
  2: "bg-zinc-200 text-zinc-500",
};

// Fallback catalog chain every generated ExamPaper attaches to. Real
// categorization lives on the BlueprintTemplate itself (its Name, e.g.
// "jee-btech-main-temp-2026") — there's no admin UI for ExamBody/Program/
// Stage yet, so every accepted template shares this one placeholder chain
// rather than inventing per-template catalog entries.
export const FALLBACK_CATALOG = {
  bodyName: "Templates",
  programCode: "GENERAL",
  programName: "General",
  stageCode: "GENERAL",
  stageName: "General",
};

// TestKind lookup is a fixed, caller-supplied id (no autoincrement) — reuse
// the one seeded in DB_SCHEMA.sql if present, otherwise this is the fallback
// row createMockTestDraft creates on first use.
export const FALLBACK_TEST_KIND = { code: "mock_test", name: "Mock Test" };
