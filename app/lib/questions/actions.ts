"use server";

import { callTeacherService } from "@/app/lib/db/teacherService";
import { getCaseStudy, getQuestionForEdit, listCaseStudies } from "./data";
import type { CaseStudyDetail, CaseStudyListItem } from "./data";
import {
  buildCaseStudyContext,
  buildCaseStudySearchText,
  validateCaseStudy,
  type CaseStudyRef,
} from "./caseStudy";
import {
  buildContent,
  buildSearchText,
  validateQuestion,
  type QuestionInput,
} from "./schema";
import { revalidatePath } from "next/cache";
import { getServiceOptions } from "@/app/lib/db/serviceConfig";
import { toValueRecord } from "@/app/lib/db/serviceOptions";

export type CreateQuestionsResult =
  | { ok: true; created: { code: string; questionId: string }[] }
  | { ok: false; error: string };

export type CreateQuestionLotResult =
  | { ok: true; lotId: string; lotNo: string }
  | { ok: false; error: string };

export type UpdateQuestionResult = { ok: true } | { ok: false; error: string };

export type ChangeStatusResult = { ok: true } | { ok: false; error: string };

export type DeleteQuestionResult = { ok: true } | { ok: false; error: string };

export async function getQuestionStatus() {
  const s = await getServiceOptions("QUESTION_STATUS");
  return toValueRecord(s);
}

function errorFrom(result: unknown, fallback: string): string {
  return typeof result === "string" ? result : fallback;
}

// Mode 12 of dbo.spMcqTeacherService — see mcq-admin/sql/spMcqTeacherService-deploy.sql.
// Mints a new lot the moment the Create Questions page loads (see
// QuestionBankEditor's initial state); the SP itself generates LotNo and
// retries on a rare unique-constraint collision, so this is a single call.
export async function createQuestionLot(): Promise<CreateQuestionLotResult> {
  const result = await callTeacherService<{ LotId: string; LotNo: string } | string>(12, {});
  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Could not generate a unique lot number. Please try again.") };
  }
  return { ok: true, lotId: result.LotId, lotNo: result.LotNo };
}

export async function createQuestions(
  inputs: QuestionInput[],
  lotId?: string | null,
): Promise<CreateQuestionsResult> {
  if (!inputs || inputs.length === 0) {
    return { ok: false, error: "No questions to create." };
  }
  if (inputs.length > 200) {
    return {
      ok: false,
      error: "Please submit 200 questions or fewer at a time.",
    };
  }

  const QUESTION_STATUS = await getQuestionStatus();
  const validStatusValues = Object.values(QUESTION_STATUS);

  for (const [i, q] of inputs.entries()) {
    const err = validateQuestion(q, validStatusValues);
    if (err) return { ok: false, error: `Question ${i + 1}: ${err}` };
    if (q.typeCode === "case_study" && !q.caseStudy?.groupId) {
      return { ok: false, error: `Question ${i + 1}: save its case study first.` };
    }
  }

  const explicitCodes = inputs.map((q) => q.code?.trim()).filter((c): c is string => !!c);
  const dupeInBatch = explicitCodes.filter((c, i) => explicitCodes.indexOf(c) !== i);
  if (dupeInBatch.length) {
    return {
      ok: false,
      error: `Duplicate code(s) in this batch: ${[...new Set(dupeInBatch)].join(", ")}`,
    };
  }

  // Content validation and building of Presentation/AnswerJson/SearchText
  // stay in TS (schema.ts, pure functions) — the SP only does DB-level
  // checks and the writes. See Mode 13's header comment for the full shape.
  const questions = inputs.map((q) => {
    const { presentation, answer } = buildContent(q);
    return {
      Code: q.code?.trim() || "",
      TypeCode: q.typeCode,
      Difficulty: q.difficulty,
      Status: q.status,
      EstSolveSec: q.estSolveSec ?? null,
      PresentationJson: JSON.stringify(presentation),
      AnswerJson: JSON.stringify(answer),
      SearchText: buildSearchText(q),
      Tags: q.tags
        .map((t) => ({ Key: t.key.trim(), Value: t.value.trim() }))
        .filter((t) => t.Key && t.Value),
      GroupId: q.typeCode === "case_study" ? (q.caseStudy?.groupId ?? null) : null,
      GroupSeq: q.typeCode === "case_study" ? (q.groupSeq ?? null) : null,
    };
  });

  const result = await callTeacherService<{ Created: { Code: string; QuestionId: string }[] } | string>(13, {
    LotId: lotId ?? null,
    Questions: questions,
  });

  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to create the question(s).") };
  }

  revalidatePath("/questions");
  revalidatePath("/");

  return {
    ok: true,
    created: (result.Created ?? []).map((c) => ({ code: c.Code, questionId: c.QuestionId })),
  };
}

// Edits are versioned: every save creates a new QuestionVersion (Mode 14)
// and repoints Question.CurrentVersionId. Status is intentionally left
// alone here — use changeQuestionStatus for that, so review/approval stays
// a distinct, audited action.
export async function updateQuestion(
  questionId: string,
  input: QuestionInput,
  changeNote?: string,
): Promise<UpdateQuestionResult> {
  const questionStatusOptions = await getServiceOptions("QUESTION_STATUS");
  const err = validateQuestion(input, questionStatusOptions.map((o) => o.value));
  if (err) return { ok: false, error: err };
  if (input.typeCode === "case_study" && !input.caseStudy?.groupId) {
    return { ok: false, error: "Save the case study first." };
  }

  const { presentation, answer } = buildContent(input);

  const result = await callTeacherService<string>(14, {
    QuestionId: questionId,
    TypeCode: input.typeCode,
    Difficulty: input.difficulty,
    EstSolveSec: input.estSolveSec ?? null,
    PresentationJson: JSON.stringify(presentation),
    AnswerJson: JSON.stringify(answer),
    SearchText: buildSearchText(input),
    ChangeNote: changeNote?.trim() || null,
    Tags: input.tags
      .map((t) => ({ Key: t.key.trim(), Value: t.value.trim() }))
      .filter((t) => t.Key && t.Value),
    // Always (re)apply the case study: a case_study question points at its
    // saved paragraph, any other kind is detached. See Mode 14.
    SetGroup: true,
    GroupId: input.typeCode === "case_study" ? (input.caseStudy?.groupId ?? null) : null,
    GroupSeq: input.typeCode === "case_study" ? (input.groupSeq ?? null) : null,
  });

  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
  revalidatePath("/");

  return { ok: true };
}

// Status transitions are logged as a ReviewAction (FromStatus -> ToStatus)
// against the question's current version, separately from content edits.
export async function changeQuestionStatus(
  questionId: string,
  toStatus: number,
  comment?: string,
): Promise<ChangeStatusResult> {
  const QUESTION_STATUS = await getQuestionStatus();
  const validStatuses = Object.values(QUESTION_STATUS) as number[];
  if (!validStatuses.includes(toStatus)) {
    return { ok: false, error: "Invalid status." };
  }

  const result = await callTeacherService<string>(15, {
    QuestionId: questionId,
    ToStatus: toStatus,
    Comment: comment?.trim() || null,
  });

  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
  revalidatePath("/");

  return { ok: true };
}

// Soft delete only: flips IsDeleted so the question drops out of every
// IsDeleted:false query (list, edit, reference lookups) without losing the
// row's history (versions, tags, review actions).
export async function deleteQuestion(questionId: string): Promise<DeleteQuestionResult> {
  const result = await callTeacherService<string>(16, { QuestionId: questionId });

  if (typeof result === "string" && result !== "OK") {
    return { ok: false, error: result };
  }

  revalidatePath("/questions");
  revalidatePath("/");

  return { ok: true };
}

export type DuplicateSourceResult =
  | { ok: true; input: QuestionInput }
  | { ok: false; error: string };

// Used by the Create Questions page's "Saved earlier today" panel to pull a
// previously-saved question's content into a new, editable (unsaved) row.
export async function getQuestionInputForDuplicate(
  questionId: string,
): Promise<DuplicateSourceResult> {
  const existing = await getQuestionForEdit(questionId);
  if (!existing) return { ok: false, error: "Question not found." };
  return { ok: true, input: existing.input };
}

export type SaveCaseStudyResult =
  | { ok: true; groupId: string; code: string }
  | { ok: false; error: string };

// Creates the case study (Mode 37) when it has no groupId yet, otherwise saves
// the edit as a new QuestionGroupVersion (Mode 38) — same versioned-edit rule as
// updateQuestion. Questions already pointing at it pick the new paragraph up
// automatically; exams that snapshotted an older version keep that one.
export async function saveCaseStudy(
  draft: Pick<CaseStudyRef, "groupId" | "code" | "title" | "text">,
  changeNote?: string,
): Promise<SaveCaseStudyResult> {
  const err = validateCaseStudy(draft);
  if (err) return { ok: false, error: err };

  const payload = {
    Title: draft.title.trim() || null,
    ContextJson: JSON.stringify(buildCaseStudyContext(draft)),
    SearchText: buildCaseStudySearchText(draft),
  };

  if (draft.groupId) {
    const result = await callTeacherService<string>(38, {
      GroupId: draft.groupId,
      ...payload,
      ChangeNote: changeNote?.trim() || null,
    });
    if (typeof result === "string" && result !== "OK") return { ok: false, error: result };
    revalidatePath("/questions");
    revalidatePath("/case-studies");
    return { ok: true, groupId: draft.groupId, code: draft.code ?? "" };
  }

  const result = await callTeacherService<{ GroupId: string; Code: string } | string>(37, payload);
  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to save the case study.") };
  }
  revalidatePath("/case-studies");
  return { ok: true, groupId: result.GroupId, code: result.Code };
}

export type DeleteCaseStudyResult = { ok: true } | { ok: false; error: string };

// Mode 48 — soft delete. The SP refuses while any question is attached to the
// case study (or an exam uses it) and says why; that message is passed through.
export async function deleteCaseStudy(groupId: string): Promise<DeleteCaseStudyResult> {
  try {
    const result = await callTeacherService<string>(48, { GroupId: groupId });
    if (typeof result === "string" && result !== "OK") return { ok: false, error: result };
    revalidatePath("/case-studies");
    revalidatePath("/questions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type CaseStudySearchResult =
  | { ok: true; items: CaseStudyListItem[]; total: number }
  | { ok: false; error: string };

// Powers the "choose existing case study" picker.
export async function searchCaseStudies(q: string, page = 1): Promise<CaseStudySearchResult> {
  try {
    const { items, total } = await listCaseStudies(q.trim(), page, 15);
    return { ok: true, items, total };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type LoadCaseStudyResult =
  | { ok: true; caseStudy: CaseStudyDetail }
  | { ok: false; error: string };

export async function loadCaseStudy(groupId: string): Promise<LoadCaseStudyResult> {
  try {
    const caseStudy = await getCaseStudy(groupId);
    if (!caseStudy) return { ok: false, error: "Case study not found." };
    return { ok: true, caseStudy };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
