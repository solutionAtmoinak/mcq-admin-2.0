// Shapes for the exam-template -> mock-test flow.
//
// A BlueprintTemplate.FilterJson is a fully self-contained exam schema (no
// ExamPaper/PaperSection/MarkingScheme rows exist yet — see the shape saved
// for "jee-btech-main-temp-2026"). Accepting a template reads this JSON,
// lets the user edit it in a form, and only then materializes real
// ExamBody/Program/Stage (reused) + fresh MarkingScheme + ExamPaper +
// PaperSection rows + a MockTest draft referencing them.

export type SectionMarking = { marks: number; negative: number };

// Exam-wide behaviour flags — stored on MockTest.SettingsJson (and, for
// templates, BlueprintFilterJson.settings). Defaults are the "no restriction"
// values so exams/templates saved before these existed behave as they did.
export type ExamSettings = {
  // Student must submit a section before the next one unlocks.
  sequentialSections: boolean;
  // Student's saved answers persist and the attempt can be resumed later.
  allowResume: boolean;
};

export const DEFAULT_EXAM_SETTINGS: ExamSettings = { sequentialSections: false, allowResume: false };

export function parseExamSettings(raw: unknown): ExamSettings {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // SQL Server's JSON_MODIFY can hand a BIT back as 1/0 rather than true/false.
  const flag = (v: unknown) => v === true || v === 1;
  return {
    sequentialSections: flag(obj.sequentialSections),
    allowResume: flag(obj.allowResume),
  };
}

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
      // Optional because templates saved before per-section timing existed
      // only carry examPaper.DurationMin — see splitLegacyDuration.
      durationMin?: number;
      // Break given to the student AFTER this section (ignored on the last
      // one). 0 / absent = no break.
      breakMin?: number;
    };
  }[];
  // Absent on templates saved before these settings existed.
  settings?: ExamSettings;
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
  durationMin: number;
  // Break after this section, in minutes (0 = none). Not counted in the
  // exam's duration and ignored for the last section.
  breakMin: number;
};

export type TemplateDraft = {
  name: string;
  testKindCode: string;
  testKindName: string;
  markingSchemeName: string;
  sections: TemplateSectionDraft[];
  sequentialSections: boolean;
  allowResume: boolean;
  // Shown to the student in a T&C-style modal before they enter the exam
  // (see MockTest.Instructions) — lives only on the materialized MockTest,
  // never on a BlueprintTemplate, so it's not part of BlueprintFilterJson.
  instructions: string;
};

export function emptyTemplateSection(): TemplateSectionDraft {
  // negative defaults to 0 — negative marking is opt-in per section (see
  // ShapeDesignerFields' NegativeMarkingToggle), not assumed on.
  return {
    clientId: nextClientId(),
    name: "",
    questionType: "mcq",
    questions: 0,
    mandatory: 0,
    marks: 4,
    negative: 0,
    durationMin: 60,
    breakMin: 0,
  };
}

export function emptyTemplateDraft(): TemplateDraft {
  return {
    name: "",
    testKindCode: "mock_test",
    testKindName: "Mock Test",
    markingSchemeName: "Standard Marking",
    sections: [emptyTemplateSection()],
    ...DEFAULT_EXAM_SETTINGS,
    instructions: "",
  };
}

// The exam's duration is always the sum of its sections' own times (breaks
// are separate and not counted) — never entered on its own.
export function totalDurationMin(sections: { durationMin: number }[]): number {
  return sections.reduce((sum, s) => sum + (Number(s.durationMin) || 0), 0);
}

// Templates/exams saved before per-section timing only have one total
// duration. Splits it across the sections in proportion to their question
// count (any rounding remainder goes to the last section) so the total is
// preserved exactly when such a shape is opened in the designer.
export function splitLegacyDuration(totalMin: number, sections: { questions: number }[]): number[] {
  if (!sections.length) return [];
  const totalQuestions = sections.reduce((sum, s) => sum + s.questions, 0);
  const shares = sections.map((s) =>
    Math.floor(totalQuestions > 0 ? (totalMin * s.questions) / totalQuestions : totalMin / sections.length),
  );
  shares[shares.length - 1] += totalMin - shares.reduce((sum, m) => sum + m, 0);
  return shares;
}

// "Copy from template" — prefills the designer from an existing template's
// FilterJson. Name is left blank (a copy needs its own name); everything
// else carries over so the user only has to adjust what's different.
export function filterJsonToTemplateDraft(filterJson: BlueprintFilterJson): TemplateDraft {
  const legacyDurations = splitLegacyDuration(
    filterJson.examPaper.DurationMin,
    filterJson.paperSections.map((s) => ({ questions: s.RulesJson.questions })),
  );
  return {
    name: "",
    testKindCode: filterJson.testKind?.code ?? "mock_test",
    testKindName: filterJson.testKind?.name ?? "Mock Test",
    markingSchemeName: filterJson.markingScheme.Name,
    ...parseExamSettings(filterJson.settings),
    // Instructions live only on the materialized MockTest, never on the
    // template itself — starting from a template always begins blank.
    instructions: "",
    sections: filterJson.paperSections.map((s, i) => ({
      clientId: nextClientId(),
      name: s.Name,
      questionType: s.RulesJson.questionType,
      questions: s.RulesJson.questions,
      mandatory: s.RulesJson.mandatory,
      marks: s.RulesJson.marks,
      negative: s.RulesJson.negative,
      durationMin: s.RulesJson.durationMin ?? legacyDurations[i],
      breakMin: s.RulesJson.breakMin ?? 0,
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
  // ExamPaper.DurationMin — only used to back-fill sections saved before
  // per-section timing existed (see splitLegacyDuration).
  durationMin: number;
  markingSchemeName: string;
  instructions: string;
  settings: ExamSettings;
  sections: {
    sectionId: string;
    name: string;
    questionType: string;
    questions: number;
    mandatory: number;
    marks: number;
    negative: number;
    durationMin?: number;
    breakMin?: number;
  }[];
}): TemplateDraft {
  const legacyDurations = splitLegacyDuration(input.durationMin, input.sections);
  return {
    name: input.examName,
    testKindCode: input.testKindCode,
    testKindName: input.testKindName,
    markingSchemeName: input.markingSchemeName,
    instructions: input.instructions,
    ...input.settings,
    sections: input.sections.map((s, i) => ({
      clientId: nextClientId(),
      sectionId: s.sectionId,
      name: s.name,
      questionType: s.questionType,
      questions: s.questions,
      mandatory: s.mandatory,
      marks: s.marks,
      negative: s.negative,
      durationMin: s.durationMin ?? legacyDurations[i],
      breakMin: s.breakMin ?? 0,
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
  if (!draft.sections.length) return "Add at least one section.";
  for (const s of draft.sections) {
    if (!s.name.trim()) return "Every section needs a name.";
    if (s.questions <= 0) return `${s.name}: question count must be greater than 0.`;
    // Mandatory-to-attempt can be at most the full pool (e.g. every question
    // required) or as few as 0 — either way it can't exceed the pool size.
    if (s.mandatory < 0 || s.mandatory > s.questions) {
      return `${s.name}: mandatory-to-attempt count must be between 0 and ${s.questions}.`;
    }
    if (s.marks <= 0) return `${s.name}: marks per question must be greater than 0.`;
    if (s.negative < 0) return `${s.name}: negative marks can't be below 0.`;
    if (!Number.isInteger(s.durationMin) || s.durationMin <= 0) {
      return `${s.name}: time must be a whole number of minutes greater than 0.`;
    }
    if (!Number.isInteger(s.breakMin) || s.breakMin < 0) {
      return `${s.name}: break must be a whole number of minutes, 0 or more.`;
    }
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
  const durationMin = totalDurationMin(draft.sections);
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
      DurationMin: durationMin,
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
        durationMin: s.durationMin,
        breakMin: s.breakMin,
      },
    })),
    settings: { sequentialSections: draft.sequentialSections, allowResume: draft.allowResume },
    summary: {
      totalQuestions,
      totalMarks,
      durationMin,
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
