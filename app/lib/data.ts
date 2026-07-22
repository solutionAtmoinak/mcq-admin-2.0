import { prisma } from "@/app/lib/prisma";
import type {
  ReferenceData,
  ReferenceTagOption,
  QuestionTypeCode,
  QuestionInput,
} from "@/app/lib/questionSchema";
import { emptyQuestion } from "@/app/lib/questionSchema";

export async function getReferenceData(): Promise<ReferenceData> {
  const [questionTypes, dimensions, tags] = await Promise.all([
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
  };
}

export type BankSummary = {
  total: number;
  recentCount: number;
  byStatus: { status: number; count: number }[];
  byType: { code: string; name: string; count: number }[];
};

export async function getBankSummary(): Promise<BankSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, recentCount, byStatusRaw, types] = await Promise.all([
    prisma.question.count({ where: { IsDeleted: false } }),
    prisma.question.count({ where: { IsDeleted: false, CreatedOn: { gte: sevenDaysAgo } } }),
    prisma.question.groupBy({
      by: ["Status"],
      where: { IsDeleted: false },
      _count: { _all: true },
    }),
    prisma.questionType.findMany({
      where: { IsDeleted: false },
      orderBy: { QuestionTypeId: "asc" },
      include: {
        _count: { select: { Question: { where: { IsDeleted: false } } } },
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
};

export type QuestionListFilters = {
  q?: string;
  typeId?: number;
  difficulty?: number;
  tagKeys?: string[];
  tagValues?: string[];
  status?: number;
  page: number;
  pageSize: number;
};

export async function listQuestions(
  filters: QuestionListFilters
): Promise<{ items: QuestionListItem[]; total: number }> {
  const where = {
    IsDeleted: false,
    ...(filters.typeId ? { QuestionTypeId: filters.typeId } : {}),
    ...(filters.difficulty ? { Difficulty: filters.difficulty } : {}),
    ...(filters.status !== undefined ? { Status: filters.status } : {}),
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
    };
  });

  return { items, total };
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
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const rows = await prisma.question.findMany({
    where: { IsDeleted: false, CreatedOn: { gte: startOfDay } },
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
  input: QuestionInput;
};

export async function getQuestionForEdit(questionId: string): Promise<EditableQuestion | null> {
  let id: bigint;
  try {
    id = BigInt(questionId);
  } catch {
    return null;
  }

  const q = await prisma.question.findFirst({
    where: { QuestionId: id, IsDeleted: false },
    include: {
      QuestionType: true,
      QuestionVersion_Question_CurrentVersionIdToQuestionVersion: true,
      QuestionTag: { include: { Tag: { include: { TagDimension: true } } } },
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
    input,
  };
}
