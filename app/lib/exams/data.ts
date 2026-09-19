import { callTeacherService } from "@/app/lib/db/teacherService";
import {
  buildTemplateDraftFromExam,
  filterJsonToTemplateDraft,
  parseBlueprintFilterJson,
  type BlueprintFilterJson,
  type MockTestRecipe,
  type TemplateDraft,
} from "./schema";

function assertOk<T>(result: T | string | undefined, fallback: string): T {
  if (result === undefined || typeof result === "string") {
    throw new Error(typeof result === "string" ? result : fallback);
  }
  return result;
}

export type BlueprintTemplateListItem = {
  templateId: string;
  name: string;
  filterJson: BlueprintFilterJson;
  // Whether the requesting franchise owns this row and may edit it — false
  // for master-franchise templates picked up through the reuse fallback
  // below. The templates list/picker UI uses this to hide the Edit action.
  isOwner: boolean;
};

// Mode 17 of dbo.spMcqTeacherService — see mcq-admin/sql/spMcqTeacherService.sql.
// Every franchise sees its own templates. Non-master franchises additionally
// see (read-only) the master franchise's templates, so they can be reused as
// a starting point for a new exam — but master's own templates are only
// ever editable by master (see getBlueprintTemplateForEdit), and master
// itself only sees its own (it never sees another franchise's templates).
// FranchiseId-vs-master comparison now happens in the SP.
type RawBlueprintTemplateListItem = { TemplateId: string; Name: string; FilterJson: string; IsOwner: boolean };

export async function listBlueprintTemplates(): Promise<BlueprintTemplateListItem[]> {
  const rows = assertOk(
    await callTeacherService<RawBlueprintTemplateListItem[] | string>(17, {}),
    "Failed to load templates.",
  );

  return (rows ?? []).map((r) => ({
    templateId: r.TemplateId,
    name: r.Name,
    filterJson: parseBlueprintFilterJson(r.FilterJson),
    isOwner: r.IsOwner,
  }));
}

export type BlueprintTemplateDraftForEdit = {
  templateId: string;
  draft: TemplateDraft;
};

// Mode 18. Edit-page counterpart to listBlueprintTemplates — reshapes one
// template's FilterJson into the same TemplateDraft the designer already
// knows how to render/validate. filterJsonToTemplateDraft blanks the name
// (that fn is also used for the "copy" flow on the exam page, where a copy
// needs its own name) — restore the template's own name here since this is
// editing that exact row, not spinning off a new one. Strict ownership only
// — no master-franchise fallback, unlike listBlueprintTemplates.
type RawBlueprintTemplate = { TemplateId: string; Name: string; FilterJson: string } | null;

export async function getBlueprintTemplateForEdit(templateId: string): Promise<BlueprintTemplateDraftForEdit | null> {
  const row = assertOk(
    await callTeacherService<RawBlueprintTemplate | string>(18, { TemplateId: templateId }),
    "Failed to load template.",
  );
  if (!row) return null;

  const filterJson = parseBlueprintFilterJson(row.FilterJson);
  const draft: TemplateDraft = { ...filterJsonToTemplateDraft(filterJson), name: row.Name };

  return { templateId: row.TemplateId, draft };
}

// Mode 19.
export async function listTestKinds(): Promise<{ code: string; name: string }[]> {
  const rows = assertOk(
    await callTeacherService<{ Code: string; Name: string }[] | string>(19, {}),
    "Failed to load test kinds.",
  );
  return (rows ?? []).map((r) => ({ code: r.Code, name: r.Name }));
}

// No local Package table (and MockTestPackage carries no name column
// either) — a link is just the LMS's PackageId. Display names are resolved
// by matching against listPackageOptions() at read time, in the UI layer.
export type MockTestPackageLink = { packageId: string };

export type MockTestListItem = {
  mockTestId: string;
  code: string;
  name: string;
  status: number;
  statusLabel: string;
  paperName: string;
  testKindName: string;
  totalMarks: string;
  durationMin: number;
  createdOn: Date;
  packages: MockTestPackageLink[];
  questionCount: number;
};

type RawMockTestListItem = {
  MockTestId: string;
  Code: string;
  Name: string;
  Status: number;
  StatusLabel: string | null;
  PaperName: string;
  TestKindName: string;
  TotalMarks: string;
  DurationMin: number;
  CreatedOn: string;
  QuestionCount: number;
  Packages: { PackageId: string }[] | null;
};

type RawMockTestListResult = { Total: number; Items: RawMockTestListItem[] | null };

// Mode 3. IsPersonalized rows are student-generated (see Mode 7 in
// student-portal/sql/spMcqStudentService.sql) — they're real MockTest rows
// but never admin-authored, so the SP excludes them from this list; a
// student reaches theirs directly at its own URL, never through here.
// Franchise scoping and the EXAM_STATUS label lookup both happen inside the
// SP now, not in this function.
export async function listMockTests(opts: { page: number; pageSize: number }): Promise<{ items: MockTestListItem[]; total: number }> {
  const result = assertOk(
    await callTeacherService<RawMockTestListResult | string>(3, {
      Page: opts.page,
      PageSize: opts.pageSize,
    }),
    "Failed to load exams.",
  );

  return {
    items: (result.Items ?? []).map((r) => ({
      mockTestId: r.MockTestId,
      code: r.Code,
      name: r.Name,
      status: r.Status,
      statusLabel: r.StatusLabel ?? "Unknown",
      paperName: r.PaperName,
      testKindName: r.TestKindName,
      totalMarks: r.TotalMarks,
      durationMin: r.DurationMin,
      createdOn: new Date(r.CreatedOn),
      packages: (r.Packages ?? []).map((p) => ({ packageId: p.PackageId })),
      questionCount: r.QuestionCount,
    })),
    total: result.Total ?? 0,
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

// Mode 20 raw shape — see that mode's SQL header for why this stays three
// raw slices (MockTest/PaperSections/TestQuestions) instead of being fully
// pre-grouped server-side: the SelectionPolicyJson recipe parsing and
// per-section grouping below is unchanged from the old Prisma version.
type RawMockTestForEdit = {
  MockTest: {
    MockTestId: string;
    Code: string;
    Name: string;
    Status: number;
    StatusLabel: string | null;
    PaperName: string;
    TotalMarks: string;
    DurationMin: number;
    SelectionPolicyJson: string | null;
  };
  PaperSections: { SectionId: string; RulesJson: string }[] | null;
  TestQuestions: {
    SectionId: string;
    SeqNo: number;
    QuestionId: string;
    Code: string;
    TypeName: string;
    Difficulty: number;
    Status: number;
    LotNo: string | null;
    Marks: string;
    Negative: string;
    Presentation: unknown;
    TagNames: { Name: string }[] | null;
  }[] | null;
} | null;

export async function getMockTestForEdit(mockTestId: string): Promise<MockTestDetail | null> {
  const row = assertOk(
    await callTeacherService<RawMockTestForEdit | string>(20, { MockTestId: mockTestId }),
    "Failed to load exam.",
  );
  if (!row) return null;

  const mt = row.MockTest;

  // Rows seeded before this recipe shape existed (e.g. the DB_SCHEMA.sql demo
  // row) carry a different, ad-hoc SelectionPolicyJson — treat anything
  // without a real `sections` array as "no recipe" rather than crashing.
  const parsedPolicy: unknown = mt.SelectionPolicyJson ? JSON.parse(mt.SelectionPolicyJson) : null;
  const recipe: MockTestRecipe | null =
    parsedPolicy && typeof parsedPolicy === "object" && Array.isArray((parsedPolicy as MockTestRecipe).sections)
      ? (parsedPolicy as MockTestRecipe)
      : null;

  const rulesBySectionId = new Map<string, { marks: number; negative: number }>();
  for (const ps of row.PaperSections ?? []) {
    try {
      const rules = JSON.parse(ps.RulesJson) as { marks: number; negative: number };
      rulesBySectionId.set(ps.SectionId, { marks: rules.marks, negative: rules.negative });
    } catch {
      // leave unset — falls back to 0 below
    }
  }

  const questionsBySectionId = new Map<string, PickedQuestionView[]>();
  for (const tq of row.TestQuestions ?? []) {
    let stemPreview = "(no content)";
    if (tq.Presentation && typeof tq.Presentation === "object" && "stem" in tq.Presentation) {
      const stem = (tq.Presentation as { stem?: unknown }).stem;
      if (typeof stem === "string" && stem) stemPreview = stem;
    }
    const view: PickedQuestionView = {
      questionId: tq.QuestionId,
      code: tq.Code,
      stemPreview,
      typeName: tq.TypeName,
      difficulty: tq.Difficulty,
      status: tq.Status,
      tagNames: (tq.TagNames ?? []).map((t) => t.Name),
      lotNo: tq.LotNo,
      seqNo: tq.SeqNo,
      marks: tq.Marks,
      negative: tq.Negative,
    };
    const list = questionsBySectionId.get(tq.SectionId);
    if (list) list.push(view);
    else questionsBySectionId.set(tq.SectionId, [view]);
  }

  return {
    mockTestId: mt.MockTestId,
    code: mt.Code,
    name: mt.Name,
    status: mt.Status,
    statusLabel: mt.StatusLabel ?? "Unknown",
    paperName: mt.PaperName,
    totalMarks: mt.TotalMarks,
    durationMin: mt.DurationMin,
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

// Mode 21. Edit-page counterpart to getMockTestForEdit's read-only view —
// pulls the live ExamPaper/PaperSection/MarkingScheme/TestKind rows (each
// MockTest has its own dedicated, never-shared copies — see
// materializeMockTest) and reshapes them into the same TemplateDraft the
// designer already knows how to render and validate.
type RawMockTestDraft = {
  MockTestId: string;
  Status: number;
  ExamName: string;
  TestKindCode: string;
  TestKindName: string;
  DurationMin: number;
  MarkingSchemeName: string;
  Instructions: string;
  Sections: { SectionId: string; Name: string; RulesJson: string }[] | null;
  PickedBySection: { SectionId: string; Picked: number }[] | null;
} | null;

export async function getMockTestDraftForEdit(mockTestId: string): Promise<MockTestDraftForEdit | null> {
  const row = assertOk(
    await callTeacherService<RawMockTestDraft | string>(21, { MockTestId: mockTestId }),
    "Failed to load exam draft.",
  );
  if (!row) return null;

  const draft = buildTemplateDraftFromExam({
    examName: row.ExamName,
    testKindCode: row.TestKindCode,
    testKindName: row.TestKindName,
    durationMin: row.DurationMin,
    markingSchemeName: row.MarkingSchemeName,
    instructions: row.Instructions,
    sections: (row.Sections ?? []).map((s) => {
      const rules = JSON.parse(s.RulesJson) as {
        questionType: string;
        questions: number;
        mandatory: number;
        marks: number;
        negative: number;
      };
      return {
        sectionId: s.SectionId,
        name: s.Name,
        questionType: rules.questionType,
        questions: rules.questions,
        mandatory: rules.mandatory,
        marks: rules.marks,
        negative: rules.negative,
      };
    }),
  });

  const pickedBySectionId: Record<string, number> = {};
  for (const c of row.PickedBySection ?? []) pickedBySectionId[c.SectionId] = c.Picked;

  return { mockTestId: row.MockTestId, status: row.Status, draft, pickedBySectionId };
}
