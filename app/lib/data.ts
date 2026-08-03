import { prisma } from "@/app/lib/prisma";
import { requireAuth, requireUser } from "@/app/lib/auth";
import { getServiceOptions } from "@/app/lib/serviceConfig";
import type {
  ReferenceData,
  ReferenceTagOption,
  QuestionTypeCode,
  QuestionInput,
} from "@/app/lib/questionSchema";
import { emptyQuestion } from "@/app/lib/questionSchema";

export async function getReferenceData(): Promise<ReferenceData> {
  await requireAuth();

  const [questionTypes, dimensions, tags, questionStatusOptions, difficultyOptions] = await Promise.all([
    prisma.questionType.findMany({
      where: { IsDeleted: false, IsActive: true },
      orderBy: { QuestionTypeId: "asc" },
    }),
    prisma.tagDimension.findMany({
      where: { IsDeleted: false, IsActive: true },
      orderBy: { Name: "asc" },
    }),
    prisma.tag.findMany({
      where: { IsDeleted: false, IsActive: true },
      orderBy: { Name: "asc" },
    }),
    getServiceOptions("QUESTION_STATUS"),
    getServiceOptions("QUESTION_DIFFICULTY"),
  ]);

  const tagsByDimensionId: Record<number, ReferenceTagOption[]> = {};
  for (const t of tags) {
    (tagsByDimensionId[t.DimensionId] ??= []).push({ id: t.TagId.toString(), name: t.Name });
  }

  return {
    questionTypes: questionTypes.map((t) => ({
      id: t.QuestionTypeId,
      code: t.Code as QuestionTypeCode,
      name: t.Name,
    })),
    dimensions: dimensions.map((d) => ({ id: d.DimensionId, code: d.Code, name: d.Name })),
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

export async function getBankSummary(): Promise<BankSummary> {
  const currentUser = await requireUser();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const franchiseId = currentUser.franchiseId;

  const [total, recentCount, byStatusRaw, types] = await Promise.all([
    prisma.question.count({ where: { IsDeleted: false, FranchiseId: franchiseId } }),
    prisma.question.count({
      where: { IsDeleted: false, FranchiseId: franchiseId, CreatedOn: { gte: sevenDaysAgo } },
    }),
    prisma.question.groupBy({
      by: ["Status"],
      where: { IsDeleted: false, FranchiseId: franchiseId },
      _count: { _all: true },
    }),
    prisma.questionType.findMany({
      where: { IsDeleted: false },
      orderBy: { QuestionTypeId: "asc" },
      include: {
        _count: { select: { Question: { where: { IsDeleted: false, FranchiseId: franchiseId } } } },
      },
    }),
  ]);

  return {
    total,
    recentCount,
    byStatus: byStatusRaw
      .map((r) => ({ status: r.Status, count: r._count._all }))
      .sort((a, b) => a.status - b.status),
    byType: types.map((t) => ({ code: t.Code, name: t.Name, count: t._count.Question })),
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

// Shared by listQuestions (paginated rows) and listQuestionIdsForFilter
// (bare id list for "select all matching") so the two can never drift apart
// on what counts as a match. Every caller scopes this to the requesting
// user's own franchise — a franchise only ever sees questions created at
// that franchise.
function buildQuestionWhere(filters: QuestionListFilters, franchiseId: bigint | null) {
  // An unparseable lotId (shouldn't happen — the filter is always populated
  // from listQuestionLots' own ids — but a garbage value should still match
  // nothing rather than silently ignoring the filter) collapses to an id no
  // real QuestionLot can ever have.
  let lotIdBigInt: bigint | undefined;
  if (filters.lotId) {
    try {
      lotIdBigInt = BigInt(filters.lotId);
    } catch {
      lotIdBigInt = BigInt(-1);
    }
  }

  return {
    IsDeleted: false,
    FranchiseId: franchiseId,
    ...(filters.typeId ? { QuestionTypeId: filters.typeId } : {}),
    ...(filters.difficulty ? { Difficulty: filters.difficulty } : {}),
    ...(filters.status !== undefined ? { Status: filters.status } : {}),
    ...(lotIdBigInt !== undefined ? { LotId: lotIdBigInt } : {}),
    ...(filters.excludeIds?.length
      ? { QuestionId: { notIn: filters.excludeIds.map((id) => BigInt(id)) } }
      : {}),
    ...(filters.tagKeys?.length || filters.tagValues?.length
      ? {
          QuestionTag: {
            some: {
              Tag: {
                ...(filters.tagValues?.length ? { Name: { in: filters.tagValues } } : {}),
                ...(filters.tagKeys?.length
                  ? { TagDimension: { Name: { in: filters.tagKeys } } }
                  : {}),
              },
            },
          },
        }
      : {}),
    ...(filters.q
      ? { QuestionSearch: { some: { SearchText: { contains: filters.q } } } }
      : {}),
  };
}

export async function listQuestions(
  filters: QuestionListFilters & { page: number; pageSize: number }
): Promise<{ items: QuestionListItem[]; total: number }> {
  const currentUser = await requireUser();

  const where = buildQuestionWhere(filters, currentUser.franchiseId);

  const [rows, total] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy: { CreatedOn: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        QuestionType: true,
        QuestionVersion_Question_CurrentVersionIdToQuestionVersion: true,
        QuestionTag: { include: { Tag: true } },
        QuestionLot: true,
      },
    }),
    prisma.question.count({ where }),
  ]);

  const items: QuestionListItem[] = rows.map((q) => {
    const version = q.QuestionVersion_Question_CurrentVersionIdToQuestionVersion;
    let stemPreview = "(no content)";
    if (version) {
      try {
        const presentation = JSON.parse(version.PresentationJson) as { stem?: string };
        if (presentation.stem) stemPreview = presentation.stem;
      } catch {
        // leave default preview
      }
    }
    return {
      id: q.QuestionId.toString(),
      code: q.Code,
      typeCode: q.QuestionType.Code,
      typeName: q.QuestionType.Name,
      difficulty: q.Difficulty,
      status: q.Status,
      stemPreview,
      tagNames: q.QuestionTag.map((qt) => qt.Tag.Name),
      createdOn: q.CreatedOn.toISOString(),
      lotNo: q.QuestionLot?.LotNo ?? null,
    };
  });

  return { items, total };
}

// Bare id list for a filter, capped at `limit` — powers the question
// picker's "select all matching filters" action, which needs every matching
// id (not just the current page) without paying for full row hydration.
export async function listQuestionIdsForFilter(
  filters: QuestionListFilters,
  limit: number
): Promise<{ ids: string[]; total: number }> {
  const currentUser = await requireUser();

  const where = buildQuestionWhere(filters, currentUser.franchiseId);

  const [rows, total] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy: { CreatedOn: "desc" },
      take: Math.max(0, limit),
      select: { QuestionId: true },
    }),
    prisma.question.count({ where }),
  ]);

  return { ids: rows.map((r) => r.QuestionId.toString()), total };
}

export type QuestionLotOption = {
  lotId: string;
  lotNo: string;
  questionCount: number;
  createdOn: string;
};

// Powers the question picker's lot filter — only lots that still have at
// least one active question are worth offering, and the most recent ones
// (each "Create Questions" browser session mints its own lot) are what an
// admin is almost always looking for.
export async function listQuestionLots(): Promise<QuestionLotOption[]> {
  const currentUser = await requireUser();

  const lots = await prisma.questionLot.findMany({
    where: { IsDeleted: false, FranchiseId: currentUser.franchiseId },
    orderBy: { CreatedOn: "desc" },
    take: 200,
    include: {
      _count: { select: { Question: { where: { IsDeleted: false, FranchiseId: currentUser.franchiseId } } } },
    },
  });

  return lots
    .filter((l) => l._count.Question > 0)
    .map((l) => ({
      lotId: l.LotId.toString(),
      lotNo: l.LotNo,
      questionCount: l._count.Question,
      createdOn: l.CreatedOn.toISOString(),
    }));
}

export type TodayQuestionItem = {
  id: string;
  code: string;
  stemPreview: string;
  status: number;
  createdOn: string;
};

// Powers the "today's questions" side explorer on the Create Questions page —
// questions already saved today, so freshly-created ones show up alongside
// the in-progress rows still being edited in the current session.
export async function getTodayQuestions(limit = 50): Promise<TodayQuestionItem[]> {
  const currentUser = await requireUser();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const rows = await prisma.question.findMany({
    where: { IsDeleted: false, FranchiseId: currentUser.franchiseId, CreatedOn: { gte: startOfDay } },
    orderBy: { CreatedOn: "desc" },
    take: limit,
    include: {
      QuestionVersion_Question_CurrentVersionIdToQuestionVersion: true,
    },
  });

  return rows.map((q) => {
    const version = q.QuestionVersion_Question_CurrentVersionIdToQuestionVersion;
    let stemPreview = "(no content)";
    if (version) {
      try {
        const presentation = JSON.parse(version.PresentationJson) as { stem?: string };
        if (presentation.stem) stemPreview = presentation.stem;
      } catch {
        // leave default preview
      }
    }
    return {
      id: q.QuestionId.toString(),
      code: q.Code,
      stemPreview,
      status: q.Status,
      createdOn: q.CreatedOn.toISOString(),
    };
  });
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

export async function getQuestionForEdit(questionId: string): Promise<EditableQuestion | null> {
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(questionId);
  } catch {
    return null;
  }

  const q = await prisma.question.findFirst({
    where: { QuestionId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
    include: {
      QuestionType: true,
      QuestionVersion_Question_CurrentVersionIdToQuestionVersion: true,
      QuestionTag: { include: { Tag: { include: { TagDimension: true } } } },
      QuestionLot: true,
    },
  });
  if (!q) return null;

  const version = q.QuestionVersion_Question_CurrentVersionIdToQuestionVersion;
  let presentation: { stem?: string; options?: { id: string; text: string }[]; responseType?: string } = {};
  let answer: { correct?: string[] | number | string; marks?: number; negative?: number; explanation?: string } = {};
  if (version) {
    try {
      presentation = JSON.parse(version.PresentationJson);
    } catch {
      // ignore malformed content
    }
    try {
      answer = JSON.parse(version.AnswerJson);
    } catch {
      // ignore malformed content
    }
  }

  const typeCode = q.QuestionType.Code as QuestionTypeCode;
  const isOptionBased = typeCode === "mcq_single" || typeCode === "msq";

  const input = emptyQuestion({
    code: q.Code,
    typeCode,
    difficulty: q.Difficulty,
    status: q.Status,
    estSolveSec: q.EstSolveSec,
    stem: presentation.stem ?? "",
    options: isOptionBased && presentation.options ? presentation.options : undefined,
    correctOptionIds: isOptionBased && Array.isArray(answer.correct) ? answer.correct : [],
    correctValue: !isOptionBased && answer.correct !== undefined ? String(answer.correct) : "",
    marks: answer.marks ?? 4,
    negativeMarks: answer.negative ?? 1,
    explanation: answer.explanation ?? "",
    tags: q.QuestionTag.length
      ? q.QuestionTag.map((qt) => ({ key: qt.Tag.TagDimension.Name, value: qt.Tag.Name }))
      : [{ key: "", value: "" }],
  });

  return {
    questionId: q.QuestionId.toString(),
    code: q.Code,
    typeName: q.QuestionType.Name,
    status: q.Status,
    versionNo: version?.VersionNo ?? 1,
    createdBy: q.CreatedBy,
    createdOn: q.CreatedOn.toISOString(),
    lotNo: q.QuestionLot?.LotNo ?? null,
    input,
  };
}
