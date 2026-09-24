"use server";

import { callTeacherService } from "@/app/lib/db/teacherService";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";
import { toValueRecord } from "@/app/lib/db/serviceOptions";
import {
  listQuestionIdsForFilter,
  listQuestions,
  type QuestionListFilters,
  type QuestionListItem,
} from "@/app/lib/questions/data";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import {
  buildFilterJsonFromDraft,
  codeSlug,
  validateShapeDraft,
  validateTemplateDraft,
  type TemplateDraft,
} from "./schema";

export async function getExamStatus() {
  const s = await getServiceOptions("EXAM_STATUS");
  return toValueRecord(s);
}

function errorFrom(result: unknown, fallback: string): string {
  return typeof result === "string" ? result : fallback;
}

export type CreateMockTestFromDraftResult =
  | { ok: true; mockTestId: string; templateId: string | null }
  | { ok: false; error: string };

// Mode 22 of dbo.spMcqTeacherService — see mcq-admin/sql/spMcqTeacherService.sql.
// The exam-creation page's single entry point: design a shape from scratch
// or starting from a copied template, pick a test kind, name the exam, and
// this both materializes a real MockTest draft and — only if the user opted
// in with a template name — also saves the shape as a new reusable
// BlueprintTemplate. codeSlug/buildFilterJsonFromDraft/validateShapeDraft
// all stay in TS (schema.ts); the SP only does the writes.
export async function createMockTestFromDraft(
  examName: string,
  draft: TemplateDraft,
  saveAsTemplateName?: string,
  initialStatus?: number,
): Promise<CreateMockTestFromDraftResult> {
  const trimmedExamName = examName.trim();
  if (!trimmedExamName) return { ok: false, error: "Please name the exam." };

  const shapeErr = validateShapeDraft(draft);
  if (shapeErr) return { ok: false, error: shapeErr };

  const EXAM_STATUS = await getExamStatus();
  const resolvedInitialStatus = initialStatus ?? EXAM_STATUS.DRAFT;

  const validStatuses = Object.values(EXAM_STATUS) as number[];
  if (!validStatuses.includes(resolvedInitialStatus))
    return { ok: false, error: "Invalid status." };

  const examFilterJson = buildFilterJsonFromDraft({ ...draft, name: trimmedExamName });

  // ExamPaper.Code is VARCHAR(30) — leave room for the "-" + 8 hex chars
  // that keep it unique across the many exams that can share one Name. This
  // is a SEPARATE code from examFilterJson.examPaper.Code (which is only
  // used for BlueprintTemplate provenance, never as the real ExamPaper row's
  // Code) — same split the old materializeMockTest had.
  const paperCode = `${codeSlug(examFilterJson.examPaper.Name).slice(0, 21)}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  const templateName = saveAsTemplateName?.trim();
  const templateFilterJson = templateName ? buildFilterJsonFromDraft({ ...draft, name: templateName }) : null;

  const result = await callTeacherService<{ MockTestId: string; TemplateId: string | null } | string>(22, {
    ExamFilterJson: JSON.stringify(examFilterJson),
    PaperCode: paperCode,
    TemplateName: templateName || null,
    TemplateFilterJson: templateFilterJson ? JSON.stringify(templateFilterJson) : null,
    InitialStatus: resolvedInitialStatus,
    Instructions: draft.instructions,
  });

  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to create the exam draft.") };
  }

  revalidatePath("/exam-designer");
  if (result.TemplateId) revalidatePath("/exam-templates");

  return { ok: true, mockTestId: result.MockTestId, templateId: result.TemplateId };
}

export type UpdateMockTestFromDraftResult =
  | { ok: true; mockTestId: string; templateId: string | null }
  | { ok: false; error: string };

// Mode 23. Edit-page counterpart to createMockTestFromDraft — updates the
// exam's own dedicated MarkingScheme/ExamPaper/PaperSection rows in place.
// Only allowed while the exam is still a Draft (enforced by the SP).
export async function updateMockTestFromDraft(
  mockTestId: string,
  examName: string,
  draft: TemplateDraft,
  saveAsTemplateName?: string,
  overCapacityResolution: "trim" | "manual" = "manual",
): Promise<UpdateMockTestFromDraftResult> {
  const trimmedExamName = examName.trim();
  if (!trimmedExamName) return { ok: false, error: "Please name the exam." };

  const shapeErr = validateShapeDraft(draft);
  if (shapeErr) return { ok: false, error: shapeErr };

  const filterJson = buildFilterJsonFromDraft({ ...draft, name: trimmedExamName });

  const templateName = saveAsTemplateName?.trim();
  const templateFilterJson = templateName ? buildFilterJsonFromDraft({ ...draft, name: templateName }) : null;

  const result = await callTeacherService<{ MockTestId: string; TemplateId: string | null } | string>(23, {
    MockTestId: mockTestId,
    ExamName: trimmedExamName,
    TestKindCode: draft.testKindCode.trim(),
    TestKindName: draft.testKindName.trim() || draft.testKindCode.trim(),
    MarkingSchemeName: filterJson.markingScheme.Name,
    // Must stay a nested object: the SP still deployed in some databases reads
    // it with OPENJSON ... AS JSON, which returns NULL for a JSON *string*.
    // (The current SP accepts either form.)
    MarkingSchemeRulesJson: filterJson.markingScheme.RulesJson,
    TotalMarks: filterJson.examPaper.TotalMarks,
    // Sum of the sections' own times — see totalDurationMin.
    DurationMin: filterJson.examPaper.DurationMin,
    Settings: { sequentialSections: draft.sequentialSections, allowResume: draft.allowResume },
    Instructions: draft.instructions,
    OverCapacityResolution: overCapacityResolution,
    // Array position is the section's intended order — the SP derives
    // SeqNo from this array's own JSON index (see Mode 23's SQL), same as
    // the old TS loop's `i + 1`.
    Sections: draft.sections.map((s) => ({
      SectionId: s.sectionId ?? null,
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
    TemplateName: templateName || null,
    TemplateFilterJson: templateFilterJson ? JSON.stringify(templateFilterJson) : null,
  });

  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to update the exam.") };
  }

  revalidatePath("/exam-designer");
  revalidatePath(`/exam-designer/${mockTestId}`);
  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  if (result.TemplateId) revalidatePath("/exam-templates");

  return { ok: true, mockTestId: result.MockTestId, templateId: result.TemplateId };
}

export type ChangeMockTestStatusResult =
  | { ok: true }
  | { ok: false; error: string };

// Mode 24.
export async function changeMockTestStatus(
  mockTestId: string,
  toStatus: number,
): Promise<ChangeMockTestStatusResult> {
  const EXAM_STATUS = await getExamStatus();
  const validStatuses = Object.values(EXAM_STATUS) as number[];
  if (!validStatuses.includes(toStatus)) return { ok: false, error: "Invalid status." };

  const result = await callTeacherService<string>(24, { MockTestId: mockTestId, ToStatus: toStatus });
  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/exam-designer");
  revalidatePath(`/exam-designer/${mockTestId}`);
  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);

  return { ok: true };
}

export type DeleteMockTestResult = { ok: true } | { ok: false; error: string };

// Mode 25.
export async function deleteMockTest(mockTestId: string): Promise<DeleteMockTestResult> {
  const result = await callTeacherService<string>(25, { MockTestId: mockTestId });
  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/exam-designer");
  return { ok: true };
}

export type UpdateMockTestPackagesResult =
  | { ok: true }
  | { ok: false; error: string };

// Mode 26. Only the LMS's PackageId is stored — there's no PackageName
// column, so display names are always resolved live from
// listPackageOptions() rather than a saved snapshot.
export async function updateMockTestPackages(
  mockTestId: string,
  packageIds: number[],
): Promise<UpdateMockTestPackagesResult> {
  const result = await callTeacherService<string>(26, {
    MockTestId: mockTestId,
    PackageIds: [...new Set(packageIds)].join(","),
  });
  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/exam-designer");
  return { ok: true };
}

export type CreateBlueprintTemplateResult =
  | { ok: true; templateId: string }
  | { ok: false; error: string };

// Mode 27. Saves a self-contained exam schema straight to
// BlueprintTemplate.FilterJson — no ExamPaper/PaperSection/MarkingScheme
// rows are touched here. Those only get created later, when this template
// is used to design an exam (createMockTestFromDraft above).
export async function createBlueprintTemplate(draft: TemplateDraft): Promise<CreateBlueprintTemplateResult> {
  const err = validateTemplateDraft(draft);
  if (err) return { ok: false, error: err };

  const filterJson = buildFilterJsonFromDraft(draft);

  const result = await callTeacherService<{ TemplateId: string } | string>(27, {
    Name: draft.name.trim(),
    FilterJson: JSON.stringify(filterJson),
  });

  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to save the template.") };
  }

  revalidatePath("/exam-templates");
  revalidatePath("/exam-designer/new");
  return { ok: true, templateId: result.TemplateId };
}

export type UpdateBlueprintTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

// Mode 28. Edit-page counterpart to createBlueprintTemplate — overwrites
// the same row's Name/FilterJson in place. Strict ownership, same rule as
// deleteBlueprintTemplate.
export async function updateBlueprintTemplate(
  templateId: string,
  draft: TemplateDraft,
): Promise<UpdateBlueprintTemplateResult> {
  const err = validateTemplateDraft(draft);
  if (err) return { ok: false, error: err };

  const filterJson = buildFilterJsonFromDraft(draft);

  const result = await callTeacherService<string>(28, {
    TemplateId: templateId,
    Name: draft.name.trim(),
    FilterJson: JSON.stringify(filterJson),
  });
  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/exam-templates");
  revalidatePath(`/exam-templates/${templateId}`);
  revalidatePath("/exam-designer/new");

  return { ok: true };
}

export type DeleteBlueprintTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

// Mode 29. Soft delete only, matching deleteMockTest's convention.
export async function deleteBlueprintTemplate(templateId: string): Promise<DeleteBlueprintTemplateResult> {
  const result = await callTeacherService<string>(29, { TemplateId: templateId });
  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/exam-templates");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Question picker — searching the bank and editing a draft exam's per-
// section question picks. This is never a one-shot operation: any of it can
// be repeated as many times as needed while the exam stays a Draft;
// publishing freezes it.

export type PickerSearchInput = QuestionListFilters & {
  page: number;
  pageSize: number;
};

// Thin "use server" wrapper around data.ts's listQuestions — the picker
// drawer is a client component, so it can only reach that read helper
// through an actual server action, not a direct import.
export async function searchPickerQuestions(
  input: PickerSearchInput,
): Promise<{ items: QuestionListItem[]; total: number }> {
  return listQuestions(input);
}

// Powers "select all matching filters" — every id for the current filter,
// not just the visible page, capped well above any realistic section pool
// size so a broad filter can't pull the whole bank into one response.
export async function selectAllPickerQuestionIds(
  input: QuestionListFilters,
  limit: number,
): Promise<{ ids: string[]; total: number }> {
  return listQuestionIdsForFilter(input, Math.max(0, Math.min(limit, 2000)));
}

export type AddQuestionsResult =
  | { ok: true; addedCount: number }
  | { ok: false; error: string };

// Mode 30. Appends picked questions to the end of the section's current
// order — rejects the whole batch if it would overflow the section's pool,
// so one call never leaves a section partially applied.
export async function addQuestionsToSection(
  mockTestId: string,
  sectionId: string,
  questionIds: string[],
): Promise<AddQuestionsResult> {
  const uniqueIds = [...new Set(questionIds)];
  if (!uniqueIds.length) return { ok: false, error: "No questions selected." };

  const result = await callTeacherService<{ AddedCount: number } | string>(30, {
    MockTestId: mockTestId,
    SectionId: sectionId,
    QuestionIds: uniqueIds.join(","),
  });

  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to add the question(s).") };
  }

  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  return { ok: true, addedCount: result.AddedCount };
}

export type SectionMutationResult = { ok: true } | { ok: false; error: string };

export type RemoveQuestionsResult =
  | { ok: true; removedCount: number }
  | { ok: false; error: string };

// Mode 31. Soft-delete only (single question or a bulk-checked batch).
export async function removeQuestionsFromSection(
  mockTestId: string,
  sectionId: string,
  questionIds: string[],
): Promise<RemoveQuestionsResult> {
  const uniqueIds = [...new Set(questionIds)];
  if (!uniqueIds.length) return { ok: false, error: "No questions selected." };

  const result = await callTeacherService<{ RemovedCount: number } | string>(31, {
    MockTestId: mockTestId,
    SectionId: sectionId,
    QuestionIds: uniqueIds.join(","),
  });

  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to remove the question(s).") };
  }

  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  return { ok: true, removedCount: result.RemovedCount };
}

// Mode 32. Re-applies the section's own current SeqNo values — just
// permuted, never a fresh 1..N sequence — over its active rows in the
// caller's requested order. Used for "move up/down" and any future
// drag-to-reorder UI.
export async function reorderSectionQuestions(
  mockTestId: string,
  sectionId: string,
  orderedQuestionIds: string[],
): Promise<SectionMutationResult> {
  const result = await callTeacherService<string>(32, {
    MockTestId: mockTestId,
    SectionId: sectionId,
    OrderedQuestionIds: orderedQuestionIds,
  });
  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  return { ok: true };
}
