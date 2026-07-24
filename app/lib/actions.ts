"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { CURRENT_USER_ID, QUESTION_STATUS } from "@/app/lib/constants";
import { getQuestionForEdit } from "@/app/lib/data";
import {
  type QuestionInput,
  type TagPair,
  validateQuestion,
  buildContent,
  buildSearchText,
} from "@/app/lib/questionSchema";

// The tx param inside prisma.$transaction(async (tx) => ...) — extracted so
// the tag-resolution helper below can be shared by create and update.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type CreateQuestionsResult =
  | { ok: true; created: { code: string; questionId: string }[] }
  | { ok: false; error: string };

export type CreateQuestionLotResult =
  | { ok: true; lotId: string; lotNo: string }
  | { ok: false; error: string };

export type UpdateQuestionResult = { ok: true } | { ok: false; error: string };

export type ChangeStatusResult = { ok: true } | { ok: false; error: string };

export type DeleteQuestionResult = { ok: true } | { ok: false; error: string };

function generateCode(typeCode: string): string {
  const prefix = typeCode.slice(0, 3).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `Q-${prefix}-${rand}`;
}

function generateLotNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `LOT-${y}${m}${d}-${rand}`;
}

// Mints a new lot the moment the Create Questions page loads (see
// QuestionBankEditor's initial state). Every question saved afterwards during
// that same browser-tab session — one row at a time or via "Save All" — is
// tagged with this lot's id, so the whole batch can be found/reused as a
// group later (surfaced read-only in Batch Default Settings).
export async function createQuestionLot(): Promise<CreateQuestionLotResult> {
  const ATTEMPTS = 5;
  for (let i = 0; i < ATTEMPTS; i++) {
    const lotNo = generateLotNo();
    try {
      const lot = await prisma.questionLot.create({
        data: { LotNo: lotNo, CreatedBy: CURRENT_USER_ID },
      });
      return { ok: true, lotId: lot.LotId.toString(), lotNo: lot.LotNo };
    } catch {
      // Collision on the unique LotNo constraint — retry with a fresh
      // random suffix. Astronomically unlikely (32 bits of randomness per
      // day), so a handful of attempts is more than enough headroom.
    }
  }
  return { ok: false, error: "Could not generate a unique lot number. Please try again." };
}

// Tag dimension `Code` is a unique, DB-friendly slug derived from whatever
// key the user typed (e.g. "Subject" -> "subject", "Question Source" ->
// "question_source").
function slugifyCode(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (base || "tag").slice(0, 50);
}

// Resolves (and auto-creates) tag dimensions ("keys") and tags ("values")
// for every {key, value} pair across `tagLists` (one list per question).
// Returns a map from "keyLower|valueLower" -> TagId. Shared by create and
// update so a brand-new key/value used across a batch is only created once.
async function resolveTagIds(tx: Tx, tagLists: TagPair[][]): Promise<Map<string, bigint>> {
  const uniqueKeyLowers = new Set<string>();
  const keyDisplayByLower = new Map<string, string>();
  const uniquePairs = new Map<string, { keyLower: string; value: string }>();

  for (const tags of tagLists) {
    for (const t of tags) {
      const key = t.key.trim();
      const value = t.value.trim();
      if (!key || !value) continue;
      const keyLower = key.toLowerCase();
      uniqueKeyLowers.add(keyLower);
      if (!keyDisplayByLower.has(keyLower)) keyDisplayByLower.set(keyLower, key);
      uniquePairs.set(`${keyLower}|${value.toLowerCase()}`, { keyLower, value });
    }
  }

  // Dimensions have no rowversion column, so the normal query builder works fine here.
  const existingDimensions = await tx.tagDimension.findMany({ where: { IsDeleted: false } });
  const dimensionByLower = new Map<string, { DimensionId: number }>();
  const existingCodesLower = new Set<string>();
  for (const d of existingDimensions) {
    dimensionByLower.set(d.Name.toLowerCase(), d);
    dimensionByLower.set(d.Code.toLowerCase(), d);
    existingCodesLower.add(d.Code.toLowerCase());
  }

  const dimensionIdByKeyLower = new Map<string, number>();
  for (const keyLower of uniqueKeyLowers) {
    const existing = dimensionByLower.get(keyLower);
    if (existing) {
      dimensionIdByKeyLower.set(keyLower, existing.DimensionId);
      continue;
    }
    const displayName = keyDisplayByLower.get(keyLower)!;
    let code = slugifyCode(displayName);
    let suffix = 2;
    while (existingCodesLower.has(code)) {
      code = `${slugifyCode(displayName)}_${suffix}`;
      suffix += 1;
    }
    existingCodesLower.add(code);
    const createdDimension = await tx.tagDimension.create({
      data: { Code: code, Name: displayName, CreatedBy: CURRENT_USER_ID },
    });
    dimensionIdByKeyLower.set(keyLower, createdDimension.DimensionId);
  }

  const relevantDimensionIds = [...new Set(dimensionIdByKeyLower.values())];
  const existingTags = relevantDimensionIds.length
    ? await tx.tag.findMany({
        where: { DimensionId: { in: relevantDimensionIds }, IsDeleted: false },
      })
    : [];
  const tagIdByDimAndNameLower = new Map<string, bigint>();
  for (const t of existingTags) {
    tagIdByDimAndNameLower.set(`${t.DimensionId}|${t.Name.toLowerCase()}`, t.TagId);
  }

  const tagIdByPairKey = new Map<string, bigint>();
  for (const [pairKey, info] of uniquePairs) {
    const dimensionId = dimensionIdByKeyLower.get(info.keyLower)!;
    const lookupKey = `${dimensionId}|${info.value.toLowerCase()}`;
    let tagId = tagIdByDimAndNameLower.get(lookupKey);
    if (tagId === undefined) {
      // NOTE: Tag (like Question) has a SQL Server `rowversion`/`timestamp`
      // column (RowVer), which the structured Prisma Client query builder
      // for this generator/adapter combo cannot build create plans for
      // ("does not match any query"). Reads work fine; writes go raw.
      const insertedTag = await tx.$queryRaw<{ TagId: bigint }[]>(
        Prisma.sql`INSERT INTO dbo.Tag (DimensionId, Name, CreatedBy)
          OUTPUT INSERTED.TagId
          VALUES (${dimensionId}, ${info.value}, ${CURRENT_USER_ID})`
      );
      tagId = insertedTag[0].TagId;
      tagIdByDimAndNameLower.set(lookupKey, tagId);
    }
    tagIdByPairKey.set(pairKey, tagId);
  }

  return tagIdByPairKey;
}

function resolveQuestionTagIds(tags: TagPair[], tagIdByPairKey: Map<string, bigint>): Set<bigint> {
  const tagIds = new Set<bigint>();
  for (const t of tags) {
    const key = t.key.trim();
    const value = t.value.trim();
    if (!key || !value) continue;
    const tagId = tagIdByPairKey.get(`${key.toLowerCase()}|${value.toLowerCase()}`);
    if (tagId !== undefined) tagIds.add(tagId);
  }
  return tagIds;
}

export async function createQuestions(
  inputs: QuestionInput[],
  lotId?: string | null
): Promise<CreateQuestionsResult> {
  if (!inputs || inputs.length === 0) {
    return { ok: false, error: "No questions to create." };
  }
  if (inputs.length > 200) {
    return { ok: false, error: "Please submit 200 questions or fewer at a time." };
  }

  let lotIdBigInt: bigint | null = null;
  if (lotId) {
    try {
      lotIdBigInt = BigInt(lotId);
    } catch {
      return { ok: false, error: "Invalid lot id." };
    }
  }

  for (const [i, q] of inputs.entries()) {
    const err = validateQuestion(q);
    if (err) return { ok: false, error: `Question ${i + 1}: ${err}` };
  }

  const questionTypes = await prisma.questionType.findMany({ where: { IsDeleted: false } });
  const typeByCode = new Map(questionTypes.map((t) => [t.Code, t]));
  for (const [i, q] of inputs.entries()) {
    if (!typeByCode.has(q.typeCode)) {
      return { ok: false, error: `Question ${i + 1}: unknown question type "${q.typeCode}".` };
    }
  }

  const explicitCodes = inputs
    .map((q) => q.code?.trim())
    .filter((c): c is string => !!c);
  if (explicitCodes.length) {
    const dupeInBatch = explicitCodes.filter((c, i) => explicitCodes.indexOf(c) !== i);
    if (dupeInBatch.length) {
      return { ok: false, error: `Duplicate code(s) in this batch: ${[...new Set(dupeInBatch)].join(", ")}` };
    }
    const existing = await prisma.question.findMany({
      where: { Code: { in: explicitCodes } },
      select: { Code: true },
    });
    if (existing.length) {
      return { ok: false, error: `Code already exists: ${existing.map((e) => e.Code).join(", ")}` };
    }
  }

  const created: { code: string; questionId: string }[] = [];

  await prisma.$transaction(async (tx) => {
    const tagIdByPairKey = await resolveTagIds(tx, inputs.map((q) => q.tags));

    for (const q of inputs) {
      const type = typeByCode.get(q.typeCode)!;
      const code = q.code?.trim() || generateCode(q.typeCode);

      // NOTE: Question also has a rowversion column — see comment above.
      const isApproved = q.status === QUESTION_STATUS.APPROVED;
      const insertedRows = isApproved
        ? await tx.$queryRaw<{ QuestionId: bigint }[]>(
            Prisma.sql`INSERT INTO dbo.Question (Code, QuestionTypeId, Difficulty, Status, EstSolveSec, LotId, ApprovedBy, ApprovedOn, CreatedBy)
              OUTPUT INSERTED.QuestionId
              VALUES (${code}, ${type.QuestionTypeId}, ${q.difficulty}, ${q.status}, ${q.estSolveSec ?? null}, ${lotIdBigInt}, ${CURRENT_USER_ID}, GETDATE(), ${CURRENT_USER_ID})`
          )
        : await tx.$queryRaw<{ QuestionId: bigint }[]>(
            Prisma.sql`INSERT INTO dbo.Question (Code, QuestionTypeId, Difficulty, Status, EstSolveSec, LotId, CreatedBy)
              OUTPUT INSERTED.QuestionId
              VALUES (${code}, ${type.QuestionTypeId}, ${q.difficulty}, ${q.status}, ${q.estSolveSec ?? null}, ${lotIdBigInt}, ${CURRENT_USER_ID})`
          );
      const questionId = insertedRows[0].QuestionId;

      const { presentation, answer } = buildContent(q);
      const presentationJson = JSON.stringify(presentation);
      const answerJson = JSON.stringify(answer);
      const contentHash = crypto
        .createHash("sha256")
        .update(`${presentationJson}|${answerJson}`)
        .digest("hex");

      const version = await tx.questionVersion.create({
        data: {
          QuestionId: questionId,
          VersionNo: 1,
          Locale: "en",
          PresentationJson: presentationJson,
          AnswerJson: answerJson,
          MetaJson: JSON.stringify({ source: "question-bank-ui" }),
          ContentHash: contentHash,
          ChangeNote: "Initial version",
          CreatedBy: CURRENT_USER_ID,
        },
      });

      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.Question
          SET CurrentVersionId = ${version.VersionId}, ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
          WHERE QuestionId = ${questionId}`
      );

      const tagIds = resolveQuestionTagIds(q.tags, tagIdByPairKey);
      for (const tagId of tagIds) {
        await tx.questionTag.create({
          data: { TagId: tagId, QuestionId: questionId, CreatedBy: CURRENT_USER_ID },
        });
      }

      await tx.questionSearch.create({
        data: {
          QuestionId: questionId,
          Locale: "en",
          SearchText: buildSearchText(q),
          CreatedBy: CURRENT_USER_ID,
        },
      });

      await tx.questionStat.create({
        data: { QuestionId: questionId, CreatedBy: CURRENT_USER_ID },
      });

      created.push({ code, questionId: questionId.toString() });
    }
  });

  revalidatePath("/questions");
  revalidatePath("/");

  return { ok: true, created };
}

// Edits are versioned: every save creates a new QuestionVersion (matching
// the schema's ContentHash/ChangeNote design) and repoints
// Question.CurrentVersionId at it. QuestionTypeId/Difficulty/EstSolveSec
// live on Question itself and are updated directly. Status is intentionally
// left alone here — use changeQuestionStatus for that, so review/approval
// stays a distinct, audited action (see ReviewAction).
export async function updateQuestion(
  questionId: string,
  input: QuestionInput,
  changeNote?: string
): Promise<UpdateQuestionResult> {
  let id: bigint;
  try {
    id = BigInt(questionId);
  } catch {
    return { ok: false, error: "Invalid question id." };
  }

  const err = validateQuestion(input);
  if (err) return { ok: false, error: err };

  const existing = await prisma.question.findFirst({ where: { QuestionId: id, IsDeleted: false } });
  if (!existing) return { ok: false, error: "Question not found." };

  const type = await prisma.questionType.findFirst({ where: { Code: input.typeCode, IsDeleted: false } });
  if (!type) return { ok: false, error: `Unknown question type "${input.typeCode}".` };

  const lastVersion = await prisma.questionVersion.findFirst({
    where: { QuestionId: id },
    orderBy: { VersionNo: "desc" },
  });
  const nextVersionNo = (lastVersion?.VersionNo ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    const tagIdByPairKey = await resolveTagIds(tx, [input.tags]);

    const { presentation, answer } = buildContent(input);
    const presentationJson = JSON.stringify(presentation);
    const answerJson = JSON.stringify(answer);
    const contentHash = crypto
      .createHash("sha256")
      .update(`${presentationJson}|${answerJson}`)
      .digest("hex");

    const version = await tx.questionVersion.create({
      data: {
        QuestionId: id,
        VersionNo: nextVersionNo,
        Locale: "en",
        PresentationJson: presentationJson,
        AnswerJson: answerJson,
        MetaJson: JSON.stringify({ source: "question-bank-ui" }),
        ContentHash: contentHash,
        ChangeNote: changeNote?.trim() || "Edited via question bank UI",
        CreatedBy: CURRENT_USER_ID,
      },
    });

    // NOTE: Question has a rowversion column — see resolveTagIds comment above.
    await tx.$executeRaw(
      Prisma.sql`UPDATE dbo.Question
        SET QuestionTypeId = ${type.QuestionTypeId},
            Difficulty = ${input.difficulty},
            EstSolveSec = ${input.estSolveSec ?? null},
            CurrentVersionId = ${version.VersionId},
            ModifiedBy = ${CURRENT_USER_ID},
            ModifiedOn = GETDATE()
        WHERE QuestionId = ${id}`
    );

    await tx.questionTag.deleteMany({ where: { QuestionId: id } });
    const tagIds = resolveQuestionTagIds(input.tags, tagIdByPairKey);
    for (const tagId of tagIds) {
      await tx.questionTag.create({
        data: { TagId: tagId, QuestionId: id, CreatedBy: CURRENT_USER_ID },
      });
    }

    await tx.questionSearch.upsert({
      where: { QuestionId_Locale: { QuestionId: id, Locale: "en" } },
      create: {
        QuestionId: id,
        Locale: "en",
        SearchText: buildSearchText(input),
        CreatedBy: CURRENT_USER_ID,
      },
      update: {
        SearchText: buildSearchText(input),
        ModifiedBy: CURRENT_USER_ID,
        ModifiedOn: new Date(),
      },
    });
  });

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
  comment?: string
): Promise<ChangeStatusResult> {
  let id: bigint;
  try {
    id = BigInt(questionId);
  } catch {
    return { ok: false, error: "Invalid question id." };
  }

  const validStatuses = Object.values(QUESTION_STATUS) as number[];
  if (!validStatuses.includes(toStatus)) {
    return { ok: false, error: "Invalid status." };
  }

  const existing = await prisma.question.findFirst({ where: { QuestionId: id, IsDeleted: false } });
  if (!existing) return { ok: false, error: "Question not found." };
  if (existing.Status === toStatus) {
    return { ok: false, error: "Question is already in that status." };
  }

  await prisma.$transaction(async (tx) => {
    // NOTE: Question has a rowversion column — see resolveTagIds comment above.
    if (toStatus === QUESTION_STATUS.APPROVED) {
      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.Question
          SET Status = ${toStatus}, ApprovedBy = ${CURRENT_USER_ID}, ApprovedOn = GETDATE(),
              ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
          WHERE QuestionId = ${id}`
      );
    } else {
      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.Question
          SET Status = ${toStatus}, ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
          WHERE QuestionId = ${id}`
      );
    }

    if (existing.CurrentVersionId) {
      await tx.reviewAction.create({
        data: {
          QuestionId: id,
          VersionId: existing.CurrentVersionId,
          FromStatus: existing.Status,
          ToStatus: toStatus,
          Comment: comment?.trim() || null,
          CreatedBy: CURRENT_USER_ID,
        },
      });
    }
  });

  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
  revalidatePath("/");

  return { ok: true };
}

// Soft delete only: flips IsDeleted so the question drops out of every
// IsDeleted:false query (list, edit, reference lookups) without losing the
// row's history (versions, tags, review actions).
export async function deleteQuestion(questionId: string): Promise<DeleteQuestionResult> {
  let id: bigint;
  try {
    id = BigInt(questionId);
  } catch {
    return { ok: false, error: "Invalid question id." };
  }

  const existing = await prisma.question.findFirst({ where: { QuestionId: id, IsDeleted: false } });
  if (!existing) return { ok: false, error: "Question not found." };

  // NOTE: Question has a rowversion column — see resolveTagIds comment above.
  await prisma.$executeRaw(
    Prisma.sql`UPDATE dbo.Question
      SET IsDeleted = 1, ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
      WHERE QuestionId = ${id}`
  );

  revalidatePath("/questions");
  revalidatePath("/");

  return { ok: true };
}

export type DuplicateSourceResult =
  | { ok: true; input: QuestionInput }
  | { ok: false; error: string };

// Used by the Create Questions page's "Saved earlier today" panel to pull a
// previously-saved question's content into a new, editable (unsaved) row.
export async function getQuestionInputForDuplicate(questionId: string): Promise<DuplicateSourceResult> {
  const existing = await getQuestionForEdit(questionId);
  if (!existing) return { ok: false, error: "Question not found." };
  return { ok: true, input: existing.input };
}
