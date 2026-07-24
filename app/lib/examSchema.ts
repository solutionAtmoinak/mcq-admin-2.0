// Shapes for the exam-template -> mock-test flow.
//
// A BlueprintTemplate.FilterJson is a fully self-contained exam schema (no
// ExamPaper/PaperSection/MarkingScheme rows exist yet — see the shape saved
// for "jee-btech-main-temp-2026"). Accepting a template reads this JSON,
// lets the user edit it in a form, and only then materializes real
// ExamBody/Program/Stage (reused) + fresh MarkingScheme + ExamPaper +
// PaperSection rows + a MockTest draft referencing them.

export type SectionMarking = { marks: number; negative: number };

export type BlueprintFilterJson = {
  version: 1;
  // Optional because templates saved before this field existed (e.g.
  // "jee-btech-main-temp-2026") don't have it — callers fall back to
  // examConstants' FALLBACK_TEST_KIND when it's missing.
  testKind?: { code: string; name: string };
  markingScheme: {
    Name: string;
    RulesJson: {
      default: SectionMarking;
      bySectionType?: Record<string, SectionMarking>;
      partialMarking?: boolean;
      qualifyingOnly?: boolean;
    };
  };
  examPaper: {
    Code: string;
    Name: string;
    TotalMarks: number;
    DurationMin: number;
    IsQualifying: boolean;
    DefaultLocale: string;
  };
  paperSections: {
    SeqNo: number;
    Name: string;
    RulesJson: {
      questionType: string;
      questions: number;
      mandatory: number;
      marks: number;
      negative: number;
    };
  }[];
  summary?: {
    totalQuestions: number;
    totalMarks: number;
    durationMin: number;
    subjects: { name: string; mcq: number; numerical: number; total: number; marks: number }[];
  };
};

export function parseBlueprintFilterJson(raw: string): BlueprintFilterJson {
  return JSON.parse(raw) as BlueprintFilterJson;
}

// ---------------------------------------------------------------------------
// Shape designer — authoring an exam's shape (sections, marking, timing,
// test kind) either from scratch or by copying an existing template. A
// dynamic (add/remove) list of sections. Shared by both the exam-creation
// page (design + immediately create a MockTest) and the template-only
// designer page (save the shape as a reusable BlueprintTemplate).

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `sec-${Date.now()}-${clientIdCounter}`;
}

export type TemplateSectionDraft = {
  clientId: string;
  // Set only when this section is an existing PaperSection row being
  // edited (see buildTemplateDraftFromExam) — absent for brand-new
  // sections, which is how updateMockTestFromDraft tells "update" from
  // "insert" apart.
  sectionId?: string;
  name: string;
  questionType: string;
  questions: number;
  mandatory: number;
  marks: number;
  negative: number;
};

export type TemplateDraft = {
  name: string;
  testKindCode: string;
  testKindName: string;
  durationMin: number;
  markingSchemeName: string;
  sections: TemplateSectionDraft[];
};

export function emptyTemplateSection(): TemplateSectionDraft {
  // negative defaults to 0 — negative marking is opt-in per section (see
  // ShapeDesignerFields' NegativeMarkingToggle), not assumed on.
  return { clientId: nextClientId(), name: "", questionType: "mcq", questions: 0, mandatory: 0, marks: 4, negative: 0 };
}

export function emptyTemplateDraft(): TemplateDraft {
  return {
    name: "",
    testKindCode: "mock_test",
    testKindName: "Mock Test",
    durationMin: 180,
    markingSchemeName: "Standard Marking",
    sections: [emptyTemplateSection()],
  };
}

// "Copy from template" — prefills the designer from an existing template's
// FilterJson. Name is left blank (a copy needs its own name); everything
// else carries over so the user only has to adjust what's different.
export function filterJsonToTemplateDraft(filterJson: BlueprintFilterJson): TemplateDraft {
  return {
    name: "",
    testKindCode: filterJson.testKind?.code ?? "mock_test",
    testKindName: filterJson.testKind?.name ?? "Mock Test",
    durationMin: filterJson.examPaper.DurationMin,
    markingSchemeName: filterJson.markingScheme.Name,
    sections: filterJson.paperSections.map((s) => ({
      clientId: nextClientId(),
      name: s.Name,
      questionType: s.RulesJson.questionType,
      questions: s.RulesJson.questions,
      mandatory: s.RulesJson.mandatory,
      marks: s.RulesJson.marks,
      negative: s.RulesJson.negative,
    })),
  };
}

// Reconstructs an editable TemplateDraft from an already-materialized
// exam's live rows (ExamPaper + PaperSection + MarkingScheme + TestKind) —
// the edit-page counterpart to filterJsonToTemplateDraft, which instead
// reads a never-materialized BlueprintTemplate.FilterJson. Each section
// keeps its real sectionId so the update path can tell "edit this row"
// apart from "insert a new one."
export function buildTemplateDraftFromExam(input: {
  examName: string;
  testKindCode: string;
  testKindName: string;
  durationMin: number;
  markingSchemeName: string;
  sections: {
    sectionId: string;
    name: string;
    questionType: string;
    questions: number;
    mandatory: number;
    marks: number;
    negative: number;
  }[];
}): TemplateDraft {
  return {
    name: input.examName,
    testKindCode: input.testKindCode,
    testKindName: input.testKindName,
    durationMin: input.durationMin,
    markingSchemeName: input.markingSchemeName,
    sections: input.sections.map((s) => ({
      clientId: nextClientId(),
      sectionId: s.sectionId,
      name: s.name,
      questionType: s.questionType,
      questions: s.questions,
      mandatory: s.mandatory,
      marks: s.marks,
      negative: s.negative,
    })),
  };
}

export function codeSlug(input: string): string {
  const base = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "TEMPLATE").slice(0, 24);
}

// Validates everything about a shape EXCEPT its name — shared by both the
// template designer (which also requires draft.name) and the exam-creation
// page (which has its own separate "exam name" field instead of draft.name).
export function validateShapeDraft(draft: TemplateDraft): string | null {
  if (!draft.testKindCode.trim()) return "Please pick or name a test kind.";
  if (draft.durationMin <= 0) return "Duration must be greater than 0 minutes.";
  if (!draft.sections.length) return "Add at least one section.";
  for (const s of draft.sections) {
    if (!s.name.trim()) return "Every section needs a name.";
    if (s.questions <= 0) return `${s.name}: question count must be greater than 0.`;
    // Strictly less than the pool, not equal — mandatory-to-attempt is the
    // "must answer" count within a larger pool (e.g. JEE: 30 in the pool, 25
    // mandatory, 5 optional); equal to the pool leaves no optional buffer.
    if (s.mandatory < 0 || s.mandatory >= s.questions) {
      return `${s.name}: mandatory-to-attempt count must be less than the pool of ${s.questions} question${s.questions === 1 ? "" : "s"}.`;
    }
    if (s.marks <= 0) return `${s.name}: marks per question must be greater than 0.`;
    if (s.negative < 0) return `${s.name}: negative marks can't be below 0.`;
  }
  return null;
}

export function validateTemplateDraft(draft: TemplateDraft): string | null {
  if (!draft.name.trim()) return "Please name the template.";
  return validateShapeDraft(draft);
}

// Builds the self-contained FilterJson saved on BlueprintTemplate.FilterJson
// — totals are always derived from the sections, never entered separately,
// so an authored template can't drift out of internal consistency.
export function buildFilterJsonFromDraft(draft: TemplateDraft): BlueprintFilterJson {
  const totalQuestions = draft.sections.reduce((sum, s) => sum + s.questions, 0);
  const totalMarks = draft.sections.reduce((sum, s) => sum + s.questions * s.marks, 0);
  const bySectionType: Record<string, SectionMarking> = {};
  for (const s of draft.sections) {
    bySectionType[s.questionType] = { marks: s.marks, negative: s.negative };
  }

  return {
    version: 1,
    testKind: { code: draft.testKindCode.trim(), name: draft.testKindName.trim() || draft.testKindCode.trim() },
    markingScheme: {
      Name: draft.markingSchemeName.trim() || "Standard Marking",
      RulesJson: {
        default: { marks: draft.sections[0]?.marks ?? 4, negative: draft.sections[0]?.negative ?? 1 },
        bySectionType,
        partialMarking: false,
        qualifyingOnly: false,
      },
    },
    examPaper: {
      Code: codeSlug(draft.name),
      Name: draft.name.trim(),
      TotalMarks: totalMarks,
      DurationMin: draft.durationMin,
      IsQualifying: false,
      DefaultLocale: "en",
    },
    paperSections: draft.sections.map((s, i) => ({
      SeqNo: i + 1,
      Name: s.name.trim(),
      RulesJson: {
        questionType: s.questionType,
        questions: s.questions,
        mandatory: s.mandatory,
        marks: s.marks,
        negative: s.negative,
      },
    })),
    summary: {
      totalQuestions,
      totalMarks,
      durationMin: draft.durationMin,
      subjects: draft.sections.map((s) => ({
        name: s.name.trim(),
        mcq: s.questionType === "mcq" ? s.questions : 0,
        numerical: s.questionType === "numerical" ? s.questions : 0,
        total: s.questions,
        marks: s.questions * s.marks,
      })),
    },
  };
}

// Snapshot frozen onto MockTest.SelectionPolicyJson once the draft is
// created — the authoritative target for the question picker and publish
// validation from then on (real SectionIds, not template-time placeholders).
export type MockTestRecipe = {
  version: 1;
  // null when the exam was designed from scratch (not copied from a saved
  // template) — there's nothing to attribute provenance to.
  templateId: string | null;
  sections: {
    sectionId: string;
    name: string;
    questionType: string;
    pool: number;
    mandatory: number;
  }[];
};
