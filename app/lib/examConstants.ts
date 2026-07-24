export const MOCK_TEST_STATUS = { DRAFT: 0, PUBLISHED: 1, ARCHIVED: 2 } as const;

export const MOCK_TEST_STATUS_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Published",
  2: "Archived",
};

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
