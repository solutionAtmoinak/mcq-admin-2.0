"use server";

import { callTeacherService } from "@/app/lib/db/teacherService";
import { getQuestionForEdit } from "./data";
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

// Mode 12 of dbo.spMcqTeacherService — see mcq-admin/sql/spMcqTeacherService.sql.
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
