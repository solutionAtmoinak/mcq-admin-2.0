import { prisma } from "@/app/lib/prisma";
import {
  buildTemplateDraftFromExam,
  parseBlueprintFilterJson,
  type BlueprintFilterJson,
  type MockTestRecipe,
  type TemplateDraft,
} from "@/app/lib/examSchema";
import { MOCK_TEST_STATUS_LABELS } from "@/app/lib/examConstants";

export type BlueprintTemplateListItem = {
  templateId: string;
  name: string;
  filterJson: BlueprintFilterJson;
};

export async function listBlueprintTemplates(): Promise<BlueprintTemplateListItem[]> {
  const rows = await prisma.blueprintTemplate.findMany({
    where: { IsDeleted: false, IsActive: true },
    orderBy: { CreatedOn: "desc" },
  });
  return rows.map((r) => ({
    templateId: r.TemplateId.toString(),
    name: r.Name,
    filterJson: parseBlueprintFilterJson(r.FilterJson),
  }));
}

export async function listTestKinds(): Promise<{ code: string; name: string }[]> {
  const rows = await prisma.testKind.findMany({
    where: { IsDeleted: false },
    orderBy: { TestKindId: "asc" },
    select: { Code: true, Name: true },
  });
  return rows.map((r) => ({ code: r.Code, name: r.Name }));
}

export type MockTestListItem = {
  mockTestId: string;
  code: string;
  name: string;
  status: number;
  statusLabel: string;
  paperName: string;
  totalMarks: string;
  durationMin: number;
  createdOn: Date;
};

export async function listMockTests(opts: { page: number; pageSize: number }): Promise<{ items: MockTestListItem[]; total: number }> {
  const where = { IsDeleted: false };
  const [rows, total] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      orderBy: { CreatedOn: "desc" },
      include: { ExamPaper: { select: { Name: true, TotalMarks: true, DurationMin: true } } },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.mockTest.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      mockTestId: r.MockTestId.toString(),
      code: r.Code,
      name: r.Name,
      status: r.Status,
      statusLabel: MOCK_TEST_STATUS_LABELS[r.Status] ?? "Unknown",
      paperName: r.ExamPaper.Name,
      totalMarks: r.ExamPaper.TotalMarks.toString(),
      durationMin: r.ExamPaper.DurationMin,
      createdOn: r.CreatedOn,
    })),
    total,
  };
}

export type MockTestSectionView = {
  sectionId: string;
  name: string;
  questionType: string;
  pool: number;
  mandatory: number;
  picked: number;
};

export type MockTestDetail = {
  mockTestId: string;
  code: string;
  name: string;
  status: number;
  statusLabel: string;
  paperName: string;
  totalMarks: string;
  durationMin: number;
  templateId: string | null;
  sections: MockTestSectionView[];
};

export async function getMockTestForEdit(mockTestId: string): Promise<MockTestDetail | null> {
  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return null;
  }

  const row = await prisma.mockTest.findFirst({
    where: { MockTestId: id, IsDeleted: false },
    include: { ExamPaper: { select: { Name: true, TotalMarks: true, DurationMin: true } } },
  });
  if (!row) return null;

  // Rows seeded before this recipe shape existed (e.g. the DB_SCHEMA.sql demo
  // row) carry a different, ad-hoc SelectionPolicyJson — treat anything
  // without a real `sections` array as "no recipe" rather than crashing.
  const parsedPolicy: unknown = row.SelectionPolicyJson ? JSON.parse(row.SelectionPolicyJson) : null;
  const recipe: MockTestRecipe | null =
    parsedPolicy && typeof parsedPolicy === "object" && Array.isArray((parsedPolicy as MockTestRecipe).sections)
      ? (parsedPolicy as MockTestRecipe)
      : null;

  const pickedCounts = recipe
    ? await Promise.all(
        recipe.sections.map((s) =>
          prisma.testQuestion.count({
            where: { MockTestId: id, SectionId: BigInt(s.sectionId), IsDeleted: false },
          })
        )
      )
    : [];

  return {
    mockTestId: row.MockTestId.toString(),
    code: row.Code,
    name: row.Name,
    status: row.Status,
    statusLabel: MOCK_TEST_STATUS_LABELS[row.Status] ?? "Unknown",
    paperName: row.ExamPaper.Name,
    totalMarks: row.ExamPaper.TotalMarks.toString(),
    durationMin: row.ExamPaper.DurationMin,
    templateId: recipe?.templateId ?? null,
    sections: (recipe?.sections ?? []).map((s, i) => ({
      sectionId: s.sectionId,
      name: s.name,
      questionType: s.questionType,
      pool: s.pool,
      mandatory: s.mandatory,
      picked: pickedCounts[i] ?? 0,
    })),
  };
}

export type MockTestDraftForEdit = {
  mockTestId: string;
  status: number;
  draft: TemplateDraft;
};

// Edit-page counterpart to getMockTestForEdit's read-only view — pulls the
// live ExamPaper/PaperSection/MarkingScheme/TestKind rows (each MockTest has
// its own dedicated, never-shared copies — see materializeMockTest) and
// reshapes them into the same TemplateDraft the designer already knows how
// to render and validate.
export async function getMockTestDraftForEdit(mockTestId: string): Promise<MockTestDraftForEdit | null> {
  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return null;
  }

  const row = await prisma.mockTest.findFirst({
    where: { MockTestId: id, IsDeleted: false },
    include: {
      ExamPaper: {
        include: {
          MarkingScheme: true,
          PaperSection: { where: { IsDeleted: false }, orderBy: { SeqNo: "asc" } },
        },
      },
      TestKind: true,
    },
  });
  if (!row) return null;

  const draft = buildTemplateDraftFromExam({
    examName: row.Name,
    testKindCode: row.TestKind.Code,
    testKindName: row.TestKind.Name,
    durationMin: row.ExamPaper.DurationMin,
    markingSchemeName: row.ExamPaper.MarkingScheme?.Name ?? "Standard Marking",
    sections: row.ExamPaper.PaperSection.map((s) => {
      const rules = JSON.parse(s.RulesJson) as {
        questionType: string;
        questions: number;
        mandatory: number;
        marks: number;
        negative: number;
      };
      return {
        sectionId: s.SectionId.toString(),
        name: s.Name,
        questionType: rules.questionType,
        questions: rules.questions,
        mandatory: rules.mandatory,
        marks: rules.marks,
        negative: rules.negative,
      };
    }),
  });

  return { mockTestId: row.MockTestId.toString(), status: row.Status, draft };
}
