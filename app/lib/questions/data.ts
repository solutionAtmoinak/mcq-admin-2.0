import { callTeacherService } from "@/app/lib/db/teacherService";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";
import { emptyQuestion } from "./schema";
import type {
  ReferenceData,
  ReferenceTagOption,
  QuestionTypeCode,
  QuestionInput,
} from "./schema";

function assertOk<T>(result: T | string | undefined, fallback: string): T {
  if (result === undefined || typeof result === "string") {
    throw new Error(typeof result === "string" ? result : fallback);
  }
  return result;
}

// Mode 5 of dbo.spMcqTeacherService — see mcq-admin/sql/spMcqTeacherService.sql.
type RawReferenceData = {
  QuestionTypes: { Id: number; Code: string; Name: string }[] | null;
  Dimensions: { Id: number; Code: string; Name: string }[] | null;
  Tags: { Id: string; DimensionId: number; Name: string }[] | null;
};

export async function getReferenceData(): Promise<ReferenceData> {
  const [raw, questionStatusOptions, difficultyOptions] = await Promise.all([
    callTeacherService<RawReferenceData | string>(5, {}),
    getServiceOptions("QUESTION_STATUS"),
    getServiceOptions("QUESTION_DIFFICULTY"),
  ]);
  const result = assertOk(raw, "Failed to load reference data.");

  const tagsByDimensionId: Record<number, ReferenceTagOption[]> = {};
  for (const t of result.Tags ?? []) {
    (tagsByDimensionId[t.DimensionId] ??= []).push({ id: t.Id, name: t.Name });
  }

  return {
    questionTypes: (result.QuestionTypes ?? []).map((t) => ({
      id: t.Id,
      code: t.Code as QuestionTypeCode,
      name: t.Name,
    })),
    dimensions: (result.Dimensions ?? []).map((d) => ({ id: d.Id, code: d.Code, name: d.Name })),
    tagsByDimensionId,
    questionStatusOptions,
    difficultyOptions,
  };
}

export type BankSummary = {
  total: number;
  recentCount: number;
  byStatus: { status: number; count: number }[];
  byType: { code: string; name: string; count: number }[];
};

// Mode 6.
type RawBankSummary = {
  Total: number;
  RecentCount: number;
  ByStatus: { Status: number; Count: number }[] | null;
  ByType: { Code: string; Name: string; Count: number }[] | null;
};

export async function getBankSummary(): Promise<BankSummary> {
  const result = assertOk(
    await callTeacherService<RawBankSummary | string>(6, {}),
    "Failed to load bank summary.",
  );

  return {
    total: result.Total,
    recentCount: result.RecentCount,
    byStatus: (result.ByStatus ?? [])
      .map((r) => ({ status: r.Status, count: r.Count }))
      .sort((a, b) => a.status - b.status),
    byType: (result.ByType ?? []).map((t) => ({ code: t.Code, name: t.Name, count: t.Count })),
  };
}

export type QuestionListItem = {
  id: string;
  code: string;
  typeCode: string;
  typeName: string;
  difficulty: number;
  status: number;
  stemPreview: string;
  tagNames: string[];
  createdOn: string;
  lotNo: string | null;
};

export type QuestionListFilters = {
  q?: string;
  typeId?: number;
  difficulty?: number;
  tagKeys?: string[];
  tagValues?: string[];
  status?: number;
  lotId?: string;
  // Question ids to leave out of the results — used by the exam question
  // picker so a question already sitting in the target section can't be
  // picked into it a second time.
  excludeIds?: string[];
};

// Shared by listQuestions (Mode 7) and listQuestionIdsForFilter (Mode 8) —
// both modes implement the identical filter server-side (see the SQL file's
// header comment for those modes); this just shapes the params the same way
// for both calls so they can never drift on what a filter field means.
function buildFilterParams(filters: QuestionListFilters): Record<string, unknown> {
  return {
    Q: filters.q,
    TypeId: filters.typeId,
    Difficulty: filters.difficulty,
    Status: filters.status,
    LotId: filters.lotId,
    TagKeys: filters.tagKeys?.length ? filters.tagKeys.join(",") : undefined,
    TagValues: filters.tagValues?.length ? filters.tagValues.join(",") : undefined,
    ExcludeIds: filters.excludeIds?.length ? filters.excludeIds.join(",") : undefined,
  };
}

function stemPreviewFrom(presentation: unknown): string {
  if (presentation && typeof presentation === "object" && "stem" in presentation) {
    const stem = (presentation as { stem?: unknown }).stem;
    if (typeof stem === "string" && stem) return stem;
  }
  return "(no content)";
}

// Mode 7's SP is meant to return Presentation/TagNames as JSON-text strings
// rather than embedded JSON (see spMcqTeacherService.sql's Mode 7 comment —
// JSON_QUERY-embedding them corrupts SQL Server's FOR JSON output once a
// page's combined content crosses 65,535 characters) — but tolerate an
// already-embedded object/array too (i.e. a deployed SP still using
// JSON_QUERY), so this stays correct regardless of exactly which version of
// the SP is live in a given environment.
function parseJsonMaybe<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

type RawQuestionListItem = {
  Id: string;
  Code: string;
  TypeCode: string;
  TypeName: string;
  Difficulty: number;
  Status: number;
  Presentation: unknown;
  TagNames: unknown;
  CreatedOn: string;
  LotNo: string | null;
};

type RawQuestionListResult = { Total: number; Items: RawQuestionListItem[] | null };

export async function listQuestions(
  filters: QuestionListFilters & { page: number; pageSize: number },
): Promise<{ items: QuestionListItem[]; total: number }> {
  const result = assertOk(
    await callTeacherService<RawQuestionListResult | string>(7, {
      ...buildFilterParams(filters),
      Page: filters.page,
      PageSize: filters.pageSize,
    }),
    "Failed to load questions.",
  );

  return {
    items: (result.Items ?? []).map((q) => ({
      id: q.Id,
      code: q.Code,
      typeCode: q.TypeCode,
      typeName: q.TypeName,
      difficulty: q.Difficulty,
      status: q.Status,
      stemPreview: stemPreviewFrom(parseJsonMaybe(q.Presentation)),
      tagNames: (parseJsonMaybe<{ Name: string }[]>(q.TagNames) ?? []).map((t) => t.Name),
      createdOn: q.CreatedOn,
      lotNo: q.LotNo,
    })),
    total: result.Total ?? 0,
  };
}

// Bare id list for a filter, capped at `limit` — powers the question
// picker's "select all matching filters" action.
type RawQuestionIdsResult = { Total: number; Ids: { Id: string }[] | null };

export async function listQuestionIdsForFilter(
  filters: QuestionListFilters,
  limit: number,
): Promise<{ ids: string[]; total: number }> {
  const result = assertOk(
    await callTeacherService<RawQuestionIdsResult | string>(8, {
      ...buildFilterParams(filters),
      Limit: Math.max(0, Math.min(limit, 2000)),
    }),
    "Failed to load question ids.",
  );

  return { ids: (result.Ids ?? []).map((r) => r.Id), total: result.Total ?? 0 };
}

export type QuestionLotOption = {
  lotId: string;
  lotNo: string;
  questionCount: number;
  createdOn: string;
};

// Mode 9.
type RawQuestionLot = { LotId: string; LotNo: string; QuestionCount: number; CreatedOn: string };

export async function listQuestionLots(): Promise<QuestionLotOption[]> {
  const rows = assertOk(
    await callTeacherService<RawQuestionLot[] | string>(9, {}),
    "Failed to load question lots.",
  );

  return (rows ?? []).map((l) => ({
    lotId: l.LotId,
    lotNo: l.LotNo,
    questionCount: l.QuestionCount,
    createdOn: l.CreatedOn,
  }));
}

export type TodayQuestionItem = {
  id: string;
  code: string;
  stemPreview: string;
  status: number;
  createdOn: string;
};

// Mode 10.
type RawTodayQuestion = { Id: string; Code: string; Presentation: unknown; Status: number; CreatedOn: string };

export async function getTodayQuestions(limit = 50): Promise<TodayQuestionItem[]> {
  const rows = assertOk(
    await callTeacherService<RawTodayQuestion[] | string>(10, { Limit: limit }),
    "Failed to load today's questions.",
  );

  return (rows ?? []).map((q) => ({
    id: q.Id,
    code: q.Code,
    stemPreview: stemPreviewFrom(q.Presentation),
    status: q.Status,
    createdOn: q.CreatedOn,
  }));
}

export type EditableQuestion = {
  questionId: string;
  code: string;
  typeName: string;
  status: number;
  versionNo: number;
  createdBy: string;
  createdOn: string;
  lotNo: string | null;
  input: QuestionInput;
};

// Mode 11.
type RawQuestionForEdit = {
  QuestionId: string;
  Code: string;
  TypeCode: string;
  TypeName: string;
  Status: number;
  Difficulty: number;
  EstSolveSec: number | null;
  VersionNo: number | null;
  Presentation: unknown;
  Answer: unknown;
  CreatedBy: string;
  CreatedOn: string;
  LotNo: string | null;
  Tags: { DimensionName: string; TagName: string }[] | null;
} | null;

export async function getQuestionForEdit(questionId: string): Promise<EditableQuestion | null> {
  const q = assertOk(
    await callTeacherService<RawQuestionForEdit | string>(11, { QuestionId: questionId }),
    "Failed to load question.",
  );
  if (!q) return null;

  const presentation = (q.Presentation ?? {}) as {
    stem?: string;
    media?: QuestionInput["media"];
    options?: QuestionInput["options"];
    responseType?: string;
  };
  const answer = (q.Answer ?? {}) as {
    correct?: string[] | number | string;
    marks?: number;
    negative?: number;
    explanation?: string;
    explanationMedia?: QuestionInput["explanationMedia"];
  };

  const typeCode = q.TypeCode as QuestionInput["typeCode"];
  const isOptionBased = typeCode === "mcq_single" || typeCode === "msq";

  const input = emptyQuestion({
    code: q.Code,
    typeCode,
    difficulty: q.Difficulty,
    status: q.Status,
    estSolveSec: q.EstSolveSec,
    stem: presentation.stem ?? "",
    media: presentation.media ?? null,
    options: isOptionBased && presentation.options ? presentation.options : undefined,
    correctOptionIds: isOptionBased && Array.isArray(answer.correct) ? answer.correct : [],
    correctValue: !isOptionBased && answer.correct !== undefined ? String(answer.correct) : "",
    marks: answer.marks ?? 4,
    negativeMarks: answer.negative ?? 1,
    explanation: answer.explanation ?? "",
    explanationMedia: answer.explanationMedia ?? null,
    tags: q.Tags?.length
      ? q.Tags.map((t) => ({ key: t.DimensionName, value: t.TagName }))
      : [{ key: "", value: "" }],
  });

  return {
    questionId: q.QuestionId,
    code: q.Code,
    typeName: q.TypeName,
    status: q.Status,
    versionNo: q.VersionNo ?? 1,
    createdBy: q.CreatedBy,
    createdOn: q.CreatedOn,
    lotNo: q.LotNo,
    input,
  };
}
