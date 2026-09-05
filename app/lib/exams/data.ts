import { prisma } from "@/app/lib/db/prisma";
import { requireUser } from "@/app/lib/auth/auth";
import { MASTER_FRANCHISE_ID } from "@/app/lib/shared/constants";
import {
  buildTemplateDraftFromExam,
  filterJsonToTemplateDraft,
  parseBlueprintFilterJson,
  type BlueprintFilterJson,
  type MockTestRecipe,
  type TemplateDraft,
} from "./schema";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";
import { toLabelRecord } from "@/app/lib/db/serviceOptions";

export type BlueprintTemplateListItem = {
  templateId: string;
  name: string;
  filterJson: BlueprintFilterJson;
  // Whether the requesting franchise owns this row and may edit it — false
  // for master-franchise templates picked up through the reuse fallback
  // below. The templates list/picker UI uses this to hide the Edit action.
  isOwner: boolean;
};

// Every franchise sees its own templates. Non-master franchises additionally
// see (read-only) the master franchise's templates, so they can be reused as
// a starting point for a new exam — but master's own templates are only
// ever editable by master (see getBlueprintTemplateForEdit), and master
// itself only sees its own (it never sees another franchise's templates).
export async function listBlueprintTemplates(): Promise<BlueprintTemplateListItem[]> {
  const currentUser = await requireUser();
  const isMaster = currentUser.franchiseId === MASTER_FRANCHISE_ID;

  const rows = await prisma.blueprintTemplate.findMany({
    where: isMaster
      ? { IsDeleted: false, IsActive: true, FranchiseId: MASTER_FRANCHISE_ID }
      : {
          IsDeleted: false,
          IsActive: true,
          OR: [{ FranchiseId: currentUser.franchiseId }, { FranchiseId: MASTER_FRANCHISE_ID }],
        },
    orderBy: { CreatedOn: "desc" },
  });
  return rows.map((r) => ({
    templateId: r.TemplateId.toString(),
    name: r.Name,
    filterJson: parseBlueprintFilterJson(r.FilterJson),
    isOwner: r.FranchiseId === currentUser.franchiseId,
  }));
}

export type BlueprintTemplateDraftForEdit = {
  templateId: string;
  draft: TemplateDraft;
};

// Edit-page counterpart to listBlueprintTemplates — reshapes one template's
// FilterJson into the same TemplateDraft the designer already knows how to
// render/validate. filterJsonToTemplateDraft blanks the name (that fn is
// also used for the "copy" flow on the exam page, where a copy needs its
// own name) — restore the template's own name here since this is editing
// that exact row, not spinning off a new one.
// Strict ownership only — no master-franchise fallback here, unlike
// listBlueprintTemplates. A master template may only be edited by master,
// and master may not edit (or even open) another franchise's template.
export async function getBlueprintTemplateForEdit(templateId: string): Promise<BlueprintTemplateDraftForEdit | null> {
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(templateId);
  } catch {
    return null;
  }

  const row = await prisma.blueprintTemplate.findFirst({
    where: { TemplateId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
  });
  if (!row) return null;

  const filterJson = parseBlueprintFilterJson(row.FilterJson);
  const draft: TemplateDraft = { ...filterJsonToTemplateDraft(filterJson), name: row.Name };

  return { templateId: row.TemplateId.toString(), draft };
}

export async function listTestKinds(): Promise<{ code: string; name: string }[]> {
  await requireUser();

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
  const currentUser = await requireUser();

  const where = { IsDeleted: false, FranchiseId: currentUser.franchiseId };
  const [rows, total, examStatusOptions] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      orderBy: { CreatedOn: "desc" },
      include: { ExamPaper: { select: { Name: true, TotalMarks: true, DurationMin: true } } },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.mockTest.count({ where }),
    getServiceOptions("EXAM_STATUS"),
  ]);
  const statusLabels = toLabelRecord(examStatusOptions);
  return {
    items: rows.map((r) => ({
      mockTestId: r.MockTestId.toString(),
      code: r.Code,
      name: r.Name,
      status: r.Status,
      statusLabel: statusLabels[r.Status] ?? "Unknown",
      paperName: r.ExamPaper.Name,
      totalMarks: r.ExamPaper.TotalMarks.toString(),
      durationMin: r.ExamPaper.DurationMin,
      createdOn: r.CreatedOn,
    })),
    total,
  };
}

export type PickedQuestionView = {
  questionId: string;
  code: string;
  stemPreview: string;
  typeName: string;
  difficulty: number;
  status: number;
  tagNames: string[];
  lotNo: string | null;
  seqNo: number;
  marks: string;
  negative: string;
};

export type MockTestSectionView = {
  sectionId: string;
  name: string;
  questionType: string;
  pool: number;
  mandatory: number;
  picked: number;
  marks: number;
  negative: number;
  questions: PickedQuestionView[];
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
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return null;
  }

  const [row, examStatusOptions] = await Promise.all([
    prisma.mockTest.findFirst({
      where: { MockTestId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
      include: { ExamPaper: { select: { Name: true, TotalMarks: true, DurationMin: true } } },
    }),
    getServiceOptions("EXAM_STATUS"),
  ]);
  if (!row) return null;
  const statusLabels = toLabelRecord(examStatusOptions);

  // Rows seeded before this recipe shape existed (e.g. the DB_SCHEMA.sql demo
  // row) carry a different, ad-hoc SelectionPolicyJson — treat anything
  // without a real `sections` array as "no recipe" rather than crashing.
  const parsedPolicy: unknown = row.SelectionPolicyJson ? JSON.parse(row.SelectionPolicyJson) : null;
  const recipe: MockTestRecipe | null =
    parsedPolicy && typeof parsedPolicy === "object" && Array.isArray((parsedPolicy as MockTestRecipe).sections)
      ? (parsedPolicy as MockTestRecipe)
      : null;

  const sectionIds = (recipe?.sections ?? []).map((s) => BigInt(s.sectionId));

  // One query for every section's live marking rules (RulesJson.marks/
  // negative — the recipe snapshot only kept pool/mandatory, see
  // MockTestRecipe) and one for every picked question across all sections,
  // rather than round-tripping per section.
  const [paperSections, testQuestions] = await Promise.all([
    sectionIds.length
      ? prisma.paperSection.findMany({ where: { SectionId: { in: sectionIds } } })
      : Promise.resolve([]),
    sectionIds.length
      ? prisma.testQuestion.findMany({
          where: { MockTestId: id, SectionId: { in: sectionIds }, IsDeleted: false },
          orderBy: { SeqNo: "asc" },
          include: {
            Question: {
              include: {
                QuestionType: true,
                QuestionVersion_Question_CurrentVersionIdToQuestionVersion: true,
                QuestionTag: { include: { Tag: true } },
                QuestionLot: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const rulesBySectionId = new Map<string, { marks: number; negative: number }>();
  for (const ps of paperSections) {
    try {
      const rules = JSON.parse(ps.RulesJson) as { marks: number; negative: number };
      rulesBySectionId.set(ps.SectionId.toString(), { marks: rules.marks, negative: rules.negative });
    } catch {
      // leave unset — falls back to 0 below
    }
  }

  const questionsBySectionId = new Map<string, PickedQuestionView[]>();
  for (const tq of testQuestions) {
    const q = tq.Question;
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
    const view: PickedQuestionView = {
      questionId: q.QuestionId.toString(),
      code: q.Code,
      stemPreview,
      typeName: q.QuestionType.Name,
      difficulty: q.Difficulty,
      status: q.Status,
      tagNames: q.QuestionTag.map((qt) => qt.Tag.Name),
      lotNo: q.QuestionLot?.LotNo ?? null,
      seqNo: tq.SeqNo,
      marks: tq.EffectiveMarks.toString(),
      negative: tq.EffectiveNegative.toString(),
    };
    const sectionKey = tq.SectionId.toString();
    const list = questionsBySectionId.get(sectionKey);
    if (list) list.push(view);
    else questionsBySectionId.set(sectionKey, [view]);
  }

  return {
    mockTestId: row.MockTestId.toString(),
    code: row.Code,
    name: row.Name,
    status: row.Status,
    statusLabel: statusLabels[row.Status] ?? "Unknown",
    paperName: row.ExamPaper.Name,
    totalMarks: row.ExamPaper.TotalMarks.toString(),
    durationMin: row.ExamPaper.DurationMin,
    templateId: recipe?.templateId ?? null,
    sections: (recipe?.sections ?? []).map((s) => {
      const rules = rulesBySectionId.get(s.sectionId);
      const questions = questionsBySectionId.get(s.sectionId) ?? [];
      return {
        sectionId: s.sectionId,
        name: s.name,
        questionType: s.questionType,
        pool: s.pool,
        mandatory: s.mandatory,
        picked: questions.length,
        marks: rules?.marks ?? 0,
        negative: rules?.negative ?? 0,
        questions,
      };
    }),
  };
}

export type MockTestDraftForEdit = {
  mockTestId: string;
  status: number;
  draft: TemplateDraft;
  // How many questions are already picked in each existing section right
  // now, keyed by SectionId — lets the shape designer warn (and the save
  // flow detect) when shrinking a section's pool below its current picks,
  // before that mismatch is only discoverable later on the picker page.
  pickedBySectionId: Record<string, number>;
};

// Edit-page counterpart to getMockTestForEdit's read-only view — pulls the
// live ExamPaper/PaperSection/MarkingScheme/TestKind rows (each MockTest has
// its own dedicated, never-shared copies — see materializeMockTest) and
// reshapes them into the same TemplateDraft the designer already knows how
// to render and validate.
export async function getMockTestDraftForEdit(mockTestId: string): Promise<MockTestDraftForEdit | null> {
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return null;
  }

  const row = await prisma.mockTest.findFirst({
    where: { MockTestId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
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

  const pickedCounts = await prisma.testQuestion.groupBy({
    by: ["SectionId"],
    where: { MockTestId: id, IsDeleted: false },
    _count: { _all: true },
  });
  const pickedBySectionId: Record<string, number> = {};
  for (const c of pickedCounts) pickedBySectionId[c.SectionId.toString()] = c._count._all;

  return { mockTestId: row.MockTestId.toString(), status: row.Status, draft, pickedBySectionId };
}
