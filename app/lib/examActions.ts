"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { requireUser, type CurrentUser } from "@/app/lib/auth";
import {
  listQuestionIdsForFilter,
  listQuestions,
  type QuestionListFilters,
  type QuestionListItem,
} from "@/app/lib/data";
import { FALLBACK_CATALOG } from "@/app/lib/examConstants";
import {
  buildFilterJsonFromDraft,
  codeSlug,
  validateShapeDraft,
  validateTemplateDraft,
  type BlueprintFilterJson,
  type MockTestRecipe,
  type TemplateDraft,
} from "@/app/lib/examSchema";
import { getServiceOptions } from "./serviceConfig";
import { toValueRecord } from "./serviceOptions";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function generateMockTestCode(): string {
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `MT-${rand}`;
}

export async function getExamStatus() {
  const s = await getServiceOptions("EXAM_STATUS");
  return toValueRecord(s);
}

// ExamBody/Program/Stage have no RowVer, so plain Prisma find-or-create is
// fine. Every exam shares this one fallback chain — there's no admin UI for
// the catalog yet, and real categorization already lives on the exam/
// template's own name.
async function resolveFallbackStageId(
  tx: Tx,
  currentUser: CurrentUser,
): Promise<bigint> {
  let body = await tx.examBody.findFirst({
    where: { Name: FALLBACK_CATALOG.bodyName, IsDeleted: false },
  });
  if (!body) {
    body = await tx.examBody.create({
      data: {
        Name: FALLBACK_CATALOG.bodyName,
        CreatedBy: currentUser.id,
        FranchiseId: currentUser.franchiseId,
      },
    });
  }

  let program = await tx.examProgram.findFirst({
    where: {
      BodyId: body.BodyId,
      Code: FALLBACK_CATALOG.programCode,
      IsDeleted: false,
    },
  });
  if (!program) {
    program = await tx.examProgram.create({
      data: {
        BodyId: body.BodyId,
        Code: FALLBACK_CATALOG.programCode,
        Name: FALLBACK_CATALOG.programName,
        CreatedBy: currentUser.id,
        FranchiseId: currentUser.franchiseId,
      },
    });
  }

  let stage = await tx.examStage.findFirst({
    where: {
      ProgramId: program.ProgramId,
      Code: FALLBACK_CATALOG.stageCode,
      IsDeleted: false,
    },
  });
  if (!stage) {
    stage = await tx.examStage.create({
      data: {
        ProgramId: program.ProgramId,
        Code: FALLBACK_CATALOG.stageCode,
        Name: FALLBACK_CATALOG.stageName,
        SeqNo: 1,
        CreatedBy: currentUser.id,
        FranchiseId: currentUser.franchiseId,
      },
    });
  }

  return stage.StageId;
}

// TestKind rows use a caller-supplied id (no autoincrement). Resolves by the
// exam's own chosen test kind code (e.g. "mock_test" vs some other kind
// picked in the designer — this is the "mock or not" decision), creating a
// new row with the next free id only if that exact code doesn't exist yet.
async function resolveTestKindId(
  tx: Tx,
  code: string,
  name: string,
  currentUser: CurrentUser,
): Promise<number> {
  const existing = await tx.testKind.findFirst({
    where: { Code: code, IsDeleted: false },
  });
  if (existing) return existing.TestKindId;

  const highest = await tx.testKind.findFirst({
    orderBy: { TestKindId: "desc" },
  });
  const nextId = (highest?.TestKindId ?? 0) + 1;
  const created = await tx.testKind.create({
    data: {
      TestKindId: nextId,
      Code: code,
      Name: name,
      CreatedBy: currentUser.id,
      FranchiseId: currentUser.franchiseId,
    },
  });
  return created.TestKindId;
}

// Materializes a fully self-contained exam shape into real rows — fresh
// MarkingScheme + ExamPaper + PaperSection (never shared/reused across
// exams, even if two exams came from the same template) + a MockTest draft.
// Shared by both the "design + immediately create an exam" flow and (once a
// question picker exists) any future re-materialization needs.
async function materializeMockTest(
  tx: Tx,
  filterJson: BlueprintFilterJson,
  templateIdForProvenance: string | null,
  currentUser: CurrentUser,
  initialStatus: number,
): Promise<bigint> {
  const stageId = await resolveFallbackStageId(tx, currentUser);
  const testKind = filterJson.testKind ?? {
    code: "mock_test",
    name: "Mock Test",
  };
  const testKindId = await resolveTestKindId(
    tx,
    testKind.code,
    testKind.name,
    currentUser,
  );

  const EXAM_STATUS = await getExamStatus();

  // MarkingScheme, ExamPaper, PaperSection all have a RowVer column — raw
  // SQL with OUTPUT INSERTED.<Id>, same workaround used throughout
  // app/lib/actions.ts for Question/QuestionVersion.
  const [scheme] = await tx.$queryRaw<{ SchemeId: bigint }[]>(
    Prisma.sql`INSERT INTO dbo.MarkingScheme (Name, RulesJson, CreatedBy, FranchiseId)
      OUTPUT INSERTED.SchemeId
      VALUES (${filterJson.markingScheme.Name}, ${JSON.stringify(filterJson.markingScheme.RulesJson)}, ${currentUser.id}, ${currentUser.franchiseId})`,
  );

  // ExamPaper.Code is VARCHAR(30) — leave room for the "-" + 8 hex chars
  // that keep it unique across the many exams that can share one Name.
  const paperCode = `${codeSlug(filterJson.examPaper.Name).slice(0, 21)}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const [paper] = await tx.$queryRaw<{ PaperId: bigint }[]>(
    Prisma.sql`INSERT INTO dbo.ExamPaper (StageId, Code, Name, TotalMarks, DurationMin, IsQualifying, DefaultSchemeId, DefaultLocale, CreatedBy, FranchiseId)
      OUTPUT INSERTED.PaperId
      VALUES (${stageId}, ${paperCode}, ${filterJson.examPaper.Name}, ${filterJson.examPaper.TotalMarks}, ${filterJson.examPaper.DurationMin}, ${filterJson.examPaper.IsQualifying ? 1 : 0}, ${scheme.SchemeId}, ${filterJson.examPaper.DefaultLocale}, ${currentUser.id}, ${currentUser.franchiseId})`,
  );

  const recipeSections: MockTestRecipe["sections"] = [];
  for (const s of filterJson.paperSections) {
    const [section] = await tx.$queryRaw<{ SectionId: bigint }[]>(
      Prisma.sql`INSERT INTO dbo.PaperSection (PaperId, Name, SeqNo, RulesJson, CreatedBy, FranchiseId)
        OUTPUT INSERTED.SectionId
        VALUES (${paper.PaperId}, ${s.Name}, ${s.SeqNo}, ${JSON.stringify(s.RulesJson)}, ${currentUser.id}, ${currentUser.franchiseId})`,
    );
    recipeSections.push({
      sectionId: section.SectionId.toString(),
      name: s.Name,
      questionType: s.RulesJson.questionType,
      pool: s.RulesJson.questions,
      mandatory: s.RulesJson.mandatory,
    });
  }

  const mockTestRecipe: MockTestRecipe = {
    version: 1,
    templateId: templateIdForProvenance,
    sections: recipeSections,
  };

  let code = generateMockTestCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await tx.mockTest.findFirst({ where: { Code: code } });
    if (!clash) break;
    code = generateMockTestCode();
  }

  // Creating directly as Published (an admin can choose this up front, same
  // as picking a question's initial status on the question form) needs the
  // same PublishedOn stamp changeMockTestStatus applies on that transition.
  const publishedOnSql =
    initialStatus === EXAM_STATUS.PUBLISHED
      ? Prisma.sql`GETDATE()`
      : Prisma.sql`NULL`;
  const [mockTest] = await tx.$queryRaw<{ MockTestId: bigint }[]>(
    Prisma.sql`INSERT INTO dbo.MockTest (Code, PaperId, TestKindId, Name, Status, PublishedOn, SelectionPolicyJson, CreatedBy, FranchiseId)
      OUTPUT INSERTED.MockTestId
      VALUES (${code}, ${paper.PaperId}, ${testKindId}, ${filterJson.examPaper.Name}, ${initialStatus}, ${publishedOnSql}, ${JSON.stringify(mockTestRecipe)}, ${currentUser.id}, ${currentUser.franchiseId})`,
  );

  return mockTest.MockTestId;
}

export type CreateMockTestFromDraftResult =
  | { ok: true; mockTestId: string; templateId: string | null }
  | { ok: false; error: string };

// The exam-creation page's single entry point: design a shape from scratch
// or starting from a copied template (the page handles that prefill client
// side), pick a test kind ("mock or not"), name the exam, and this both
// materializes a real MockTest draft and — only if the user opted in with a
// template name — also saves the shape as a new reusable BlueprintTemplate.
export async function createMockTestFromDraft(
  examName: string,
  draft: TemplateDraft,
  saveAsTemplateName?: string,
  initialStatus?: number,
): Promise<CreateMockTestFromDraftResult> {
  const currentUser = await requireUser();

  const trimmedExamName = examName.trim();
  if (!trimmedExamName) return { ok: false, error: "Please name the exam." };

  const shapeErr = validateShapeDraft(draft);
  if (shapeErr) return { ok: false, error: shapeErr };

  const EXAM_STATUS = await getExamStatus();
  const resolvedInitialStatus = initialStatus ?? EXAM_STATUS.DRAFT;

  const validStatuses = Object.values(EXAM_STATUS) as number[];
  if (!validStatuses.includes(resolvedInitialStatus))
    return { ok: false, error: "Invalid status." };

  const examFilterJson = buildFilterJsonFromDraft({
    ...draft,
    name: trimmedExamName,
  });

  let templateId: string | null = null;
  const templateName = saveAsTemplateName?.trim();
  if (templateName) {
    const templateFilterJson = buildFilterJsonFromDraft({
      ...draft,
      name: templateName,
    });
    try {
      const savedTemplate = await prisma.blueprintTemplate.create({
        data: {
          Name: templateName,
          FilterJson: JSON.stringify(templateFilterJson),
          CreatedBy: currentUser.id,
          FranchiseId: currentUser.franchiseId,
        },
      });
      templateId = savedTemplate.TemplateId.toString();
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to save the template.",
      };
    }
  }

  let mockTestId: bigint;
  try {
    mockTestId = await prisma.$transaction((tx) =>
      materializeMockTest(
        tx,
        examFilterJson,
        templateId,
        currentUser,
        resolvedInitialStatus,
      ),
    );
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Failed to create the exam draft.",
    };
  }

  revalidatePath("/exam-designer");
  if (templateId) revalidatePath("/exam-templates");

  return { ok: true, mockTestId: mockTestId.toString(), templateId };
}

export type UpdateMockTestFromDraftResult =
  | { ok: true; mockTestId: string; templateId: string | null }
  | { ok: false; error: string };

// Edit-page counterpart to createMockTestFromDraft — updates the exam's own
// dedicated MarkingScheme/ExamPaper/PaperSection rows in place instead of
// materializing fresh ones (safe because those rows are never shared across
// exams to begin with). Only allowed while the exam is still a Draft, same
// gating the question picker's own mutations use for add/remove/reorder.
//
// `overCapacityResolution` covers shrinking a section's "Questions" pool
// below how many are already picked for it: "trim" removes the excess from
// the end of that section's current order (in the same transaction as the
// rest of this save), "manual" (the default) leaves picks untouched and the
// mismatch visible on the question picker page — publishing stays blocked
// (see changeMockTestStatus) until the admin resolves it there.
export async function updateMockTestFromDraft(
  mockTestId: string,
  examName: string,
  draft: TemplateDraft,
  saveAsTemplateName?: string,
  overCapacityResolution: "trim" | "manual" = "manual",
): Promise<UpdateMockTestFromDraftResult> {
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return { ok: false, error: "Invalid exam id." };
  }

  const trimmedExamName = examName.trim();
  if (!trimmedExamName) return { ok: false, error: "Please name the exam." };

  const shapeErr = validateShapeDraft(draft);
  if (shapeErr) return { ok: false, error: shapeErr };

  const [existing, EXAM_STATUS] = await Promise.all([
    prisma.mockTest.findFirst({
      where: { MockTestId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
    }),
    getExamStatus(),
  ]);
  if (!existing) return { ok: false, error: "Exam not found." };
  if (existing.Status !== EXAM_STATUS.DRAFT)
    return { ok: false, error: "Only draft exams can be edited." };

  const parsedPolicy: unknown = existing.SelectionPolicyJson
    ? JSON.parse(existing.SelectionPolicyJson)
    : null;
  const priorTemplateId =
    parsedPolicy &&
    typeof parsedPolicy === "object" &&
    "templateId" in (parsedPolicy as object)
      ? ((parsedPolicy as MockTestRecipe).templateId ?? null)
      : null;

  const filterJson = buildFilterJsonFromDraft({
    ...draft,
    name: trimmedExamName,
  });

  let templateId: string | null = null;
  const templateName = saveAsTemplateName?.trim();
  if (templateName) {
    const templateFilterJson = buildFilterJsonFromDraft({
      ...draft,
      name: templateName,
    });
    try {
      const savedTemplate = await prisma.blueprintTemplate.create({
        data: {
          Name: templateName,
          FilterJson: JSON.stringify(templateFilterJson),
          CreatedBy: currentUser.id,
          FranchiseId: currentUser.franchiseId,
        },
      });
      templateId = savedTemplate.TemplateId.toString();
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to save the template.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const testKindId = await resolveTestKindId(
        tx,
        draft.testKindCode.trim(),
        draft.testKindName.trim() || draft.testKindCode.trim(),
        currentUser,
      );

      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.MarkingScheme
          SET Name = ${filterJson.markingScheme.Name}, RulesJson = ${JSON.stringify(filterJson.markingScheme.RulesJson)},
              ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE()
          WHERE SchemeId = (SELECT DefaultSchemeId FROM dbo.ExamPaper WHERE PaperId = ${existing.PaperId})`,
      );

      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.ExamPaper
          SET Name = ${filterJson.examPaper.Name}, TotalMarks = ${filterJson.examPaper.TotalMarks}, DurationMin = ${filterJson.examPaper.DurationMin},
              ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE()
          WHERE PaperId = ${existing.PaperId}`,
      );

      const currentSections = await tx.paperSection.findMany({
        where: { PaperId: existing.PaperId, IsDeleted: false },
      });

      // PaperSection has a unique (PaperId, SeqNo) constraint that's checked
      // per-statement, not deferred to commit — reordering sections in place
      // can transiently collide with another row's current SeqNo. Bump every
      // existing row to a distinct negative placeholder first, then assign
      // final positions once nothing can clash.
      for (const cur of currentSections) {
        await tx.$executeRaw(
          Prisma.sql`UPDATE dbo.PaperSection SET SeqNo = ${-cur.SeqNo - 100000} WHERE SectionId = ${cur.SectionId}`,
        );
      }

      const keptSectionIds = new Set<string>();
      const recipeSections: MockTestRecipe["sections"] = [];

      for (let i = 0; i < draft.sections.length; i++) {
        const s = draft.sections[i];
        const rulesJson = JSON.stringify({
          questionType: s.questionType,
          questions: s.questions,
          mandatory: s.mandatory,
          marks: s.marks,
          negative: s.negative,
        });
        const seqNo = i + 1;
        const matchesExisting =
          s.sectionId &&
          currentSections.some((c) => c.SectionId.toString() === s.sectionId);

        if (matchesExisting) {
          await tx.$executeRaw(
            Prisma.sql`UPDATE dbo.PaperSection
              SET Name = ${s.name.trim()}, SeqNo = ${seqNo}, RulesJson = ${rulesJson}, ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE()
              WHERE SectionId = ${BigInt(s.sectionId!)}`,
          );
          keptSectionIds.add(s.sectionId!);
          recipeSections.push({
            sectionId: s.sectionId!,
            name: s.name.trim(),
            questionType: s.questionType,
            pool: s.questions,
            mandatory: s.mandatory,
          });

          if (overCapacityResolution === "trim") {
            const pickedRows = await tx.testQuestion.findMany({
              where: {
                MockTestId: id,
                SectionId: BigInt(s.sectionId!),
                IsDeleted: false,
              },
              orderBy: { SeqNo: "asc" },
              select: { SeqNo: true },
            });
            const excess = pickedRows.length - s.questions;
            if (excess > 0) {
              const seqNosToRemove = pickedRows
                .slice(-excess)
                .map((r) => r.SeqNo);
              await tx.testQuestion.updateMany({
                where: {
                  MockTestId: id,
                  SectionId: BigInt(s.sectionId!),
                  SeqNo: { in: seqNosToRemove },
                },
                data: {
                  IsDeleted: true,
                  ModifiedBy: currentUser.id,
                  ModifiedOn: new Date(),
                },
              });
            }
          }
        } else {
          const [inserted] = await tx.$queryRaw<{ SectionId: bigint }[]>(
            Prisma.sql`INSERT INTO dbo.PaperSection (PaperId, Name, SeqNo, RulesJson, CreatedBy, FranchiseId)
              OUTPUT INSERTED.SectionId
              VALUES (${existing.PaperId}, ${s.name.trim()}, ${seqNo}, ${rulesJson}, ${currentUser.id}, ${currentUser.franchiseId})`,
          );
          recipeSections.push({
            sectionId: inserted.SectionId.toString(),
            name: s.name.trim(),
            questionType: s.questionType,
            pool: s.questions,
            mandatory: s.mandatory,
          });
        }
      }

      // Sections the user removed in this edit — soft-delete. Their negative
      // placeholder SeqNo from above is left as-is; it can never collide
      // with a future positive assignment, so there's nothing to reconcile.
      for (const cur of currentSections) {
        if (!keptSectionIds.has(cur.SectionId.toString())) {
          await tx.$executeRaw(
            Prisma.sql`UPDATE dbo.PaperSection SET IsDeleted = 1, ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE() WHERE SectionId = ${cur.SectionId}`,
          );
        }
      }

      const recipe: MockTestRecipe = {
        version: 1,
        templateId: priorTemplateId,
        sections: recipeSections,
      };

      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.MockTest
          SET Name = ${trimmedExamName}, TestKindId = ${testKindId}, SelectionPolicyJson = ${JSON.stringify(recipe)},
              ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE()
          WHERE MockTestId = ${id}`,
      );
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update the exam.",
    };
  }

  revalidatePath("/exam-designer");
  revalidatePath(`/exam-designer/${mockTestId}`);
  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  if (templateId) revalidatePath("/exam-templates");

  return { ok: true, mockTestId, templateId };
}

export type ChangeMockTestStatusResult =
  | { ok: true }
  | { ok: false; error: string };

// Direct status change — Draft/Published/Archived. MockTest has a RowVer
// column, so this is a raw-SQL UPDATE like every other write to it.
export async function changeMockTestStatus(
  mockTestId: string,
  toStatus: number,
): Promise<ChangeMockTestStatusResult> {
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return { ok: false, error: "Invalid exam id." };
  }

  const EXAM_STATUS = await getExamStatus();

  const validStatuses = Object.values(EXAM_STATUS) as number[];
  if (!validStatuses.includes(toStatus))
    return { ok: false, error: "Invalid status." };

  const existing = await prisma.mockTest.findFirst({
    where: { MockTestId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
  });
  if (!existing) return { ok: false, error: "Exam not found." };
  if (existing.Status === toStatus)
    return { ok: false, error: "Exam is already in that status." };

  if (toStatus === EXAM_STATUS.PUBLISHED) {
    // Publishing with a section over its own pool size (e.g. after the pool
    // was shrunk below what's already picked and the admin chose to fix it
    // manually — see updateMockTestFromDraft) would ship a paper that
    // doesn't match its own shape.
    const parsedPolicy: unknown = existing.SelectionPolicyJson
      ? JSON.parse(existing.SelectionPolicyJson)
      : null;
    const recipe: MockTestRecipe | null =
      parsedPolicy &&
      typeof parsedPolicy === "object" &&
      Array.isArray((parsedPolicy as MockTestRecipe).sections)
        ? (parsedPolicy as MockTestRecipe)
        : null;

    if (recipe?.sections.length) {
      const pickedCounts = await prisma.testQuestion.groupBy({
        by: ["SectionId"],
        where: { MockTestId: id, IsDeleted: false },
        _count: { _all: true },
      });
      const pickedBySectionId = new Map(
        pickedCounts.map((c) => [c.SectionId.toString(), c._count._all]),
      );

      const overCapacity = recipe.sections
        .map((s) => ({
          name: s.name,
          pool: s.pool,
          picked: pickedBySectionId.get(s.sectionId) ?? 0,
        }))
        .filter((s) => s.picked > s.pool);

      if (overCapacity.length) {
        const detail = overCapacity
          .map((s) => `${s.name} (${s.picked} picked, pool ${s.pool})`)
          .join("; ");
        return {
          ok: false,
          error: `Cannot publish: over capacity in ${overCapacity.length === 1 ? "this section" : "these sections"} — ${detail}. Remove the extra question(s) on the question picker page first.`,
        };
      }
    }

    await prisma.$executeRaw(
      Prisma.sql`UPDATE dbo.MockTest
        SET Status = ${toStatus}, PublishedOn = GETDATE(), ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE()
        WHERE MockTestId = ${id}`,
    );
  } else {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE dbo.MockTest
        SET Status = ${toStatus}, ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE()
        WHERE MockTestId = ${id}`,
    );
  }

  revalidatePath("/exam-designer");
  revalidatePath(`/exam-designer/${mockTestId}`);
  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);

  return { ok: true };
}

export type DeleteMockTestResult = { ok: true } | { ok: false; error: string };

// Soft delete only, matching deleteQuestion's convention — flips IsDeleted
// so the exam drops out of every IsDeleted:false query without losing its
// history (any TestQuestion rows, if the picker has been used already).
export async function deleteMockTest(
  mockTestId: string,
): Promise<DeleteMockTestResult> {
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return { ok: false, error: "Invalid exam id." };
  }

  const existing = await prisma.mockTest.findFirst({
    where: { MockTestId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
  });
  if (!existing) return { ok: false, error: "Exam not found." };

  await prisma.$executeRaw(
    Prisma.sql`UPDATE dbo.MockTest
      SET IsDeleted = 1, ModifiedBy = ${currentUser.id}, ModifiedOn = GETDATE()
      WHERE MockTestId = ${id}`,
  );

  revalidatePath("/exam-designer");

  return { ok: true };
}

export type CreateBlueprintTemplateResult =
  | { ok: true; templateId: string }
  | { ok: false; error: string };

// Saves a self-contained exam schema straight to BlueprintTemplate.FilterJson
// — no ExamPaper/PaperSection/MarkingScheme rows are touched here. Those
// only get created later, when this template is used to design an exam
// (createMockTestFromDraft above). BlueprintTemplate has no RowVer, so a
// plain Prisma create is fine.
export async function createBlueprintTemplate(
  draft: TemplateDraft,
): Promise<CreateBlueprintTemplateResult> {
  const currentUser = await requireUser();

  const err = validateTemplateDraft(draft);
  if (err) return { ok: false, error: err };

  const filterJson = buildFilterJsonFromDraft(draft);

  try {
    const template = await prisma.blueprintTemplate.create({
      data: {
        Name: draft.name.trim(),
        FilterJson: JSON.stringify(filterJson),
        CreatedBy: currentUser.id,
        FranchiseId: currentUser.franchiseId,
      },
    });
    revalidatePath("/exam-templates");
    revalidatePath("/exam-designer/new");
    return { ok: true, templateId: template.TemplateId.toString() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to save the template.",
    };
  }
}

export type UpdateBlueprintTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

// Edit-page counterpart to createBlueprintTemplate — overwrites the same
// row's Name/FilterJson in place. Safe to do directly (no materialized
// ExamPaper/PaperSection exist for a template — see createMockTestFromDraft
// for where that split happens), and BlueprintTemplate has no RowVer, so a
// plain Prisma update is fine.
export async function updateBlueprintTemplate(
  templateId: string,
  draft: TemplateDraft,
): Promise<UpdateBlueprintTemplateResult> {
  const currentUser = await requireUser();

  let id: bigint;
  try {
    id = BigInt(templateId);
  } catch {
    return { ok: false, error: "Invalid template id." };
  }

  const err = validateTemplateDraft(draft);
  if (err) return { ok: false, error: err };

  // Strict ownership, same rule as getBlueprintTemplateForEdit — a master
  // template can only be updated by master, and no franchise (master
  // included) can update another franchise's template.
  const existing = await prisma.blueprintTemplate.findFirst({
    where: { TemplateId: id, IsDeleted: false, FranchiseId: currentUser.franchiseId },
  });
  if (!existing) return { ok: false, error: "Template not found." };

  const filterJson = buildFilterJsonFromDraft(draft);

  try {
    await prisma.blueprintTemplate.update({
      where: { TemplateId: id },
      data: {
        Name: draft.name.trim(),
        FilterJson: JSON.stringify(filterJson),
        ModifiedBy: currentUser.id,
        ModifiedOn: new Date(),
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update the template.",
    };
  }

  revalidatePath("/exam-templates");
  revalidatePath(`/exam-templates/${templateId}`);
  revalidatePath("/exam-designer/new");

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Question picker — searching the bank and editing a draft exam's per-
// section question picks. This is never a one-shot operation: any of it can
// be repeated as many times as needed while the exam stays a Draft (see
// loadDraftSectionContext below); publishing freezes it, matching how
// updateMockTestFromDraft already freezes the exam's shape.

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

type DraftSectionContext =
  | {
      ok: true;
      mockTestId: bigint;
      sectionId: bigint;
      pool: number;
      marks: number;
      negative: number;
      currentUser: CurrentUser;
    }
  | { ok: false; error: string };

// Shared gate for every section-picks mutation below: the exam must exist,
// still be a Draft (mirrors updateMockTestFromDraft's own gating — once
// published, picks are frozen same as the shape), and the section must
// really belong to it. Also resolves the section's live marks/negative —
// from PaperSection.RulesJson, not the recipe, since MockTestRecipe only
// keeps pool/mandatory — which every caller below needs.
async function loadDraftSectionContext(
  mockTestId: string,
  sectionId: string,
): Promise<DraftSectionContext> {
  const currentUser = await requireUser();

  let mtId: bigint;
  let secId: bigint;
  try {
    mtId = BigInt(mockTestId);
    secId = BigInt(sectionId);
  } catch {
    return { ok: false, error: "Invalid id." };
  }

  const [mockTest, EXAM_STATUS] = await Promise.all([
    prisma.mockTest.findFirst({
      where: { MockTestId: mtId, IsDeleted: false, FranchiseId: currentUser.franchiseId },
    }),
    getExamStatus(),
  ]);
  if (!mockTest) return { ok: false, error: "Exam not found." };
  if (mockTest.Status !== EXAM_STATUS.DRAFT)
    return { ok: false, error: "Only draft exams can be edited." };

  const section = await prisma.paperSection.findFirst({
    where: { SectionId: secId, PaperId: mockTest.PaperId, IsDeleted: false },
  });
  if (!section) return { ok: false, error: "Section not found on this exam." };

  const parsedPolicy: unknown = mockTest.SelectionPolicyJson
    ? JSON.parse(mockTest.SelectionPolicyJson)
    : null;
  const recipe: MockTestRecipe | null =
    parsedPolicy &&
    typeof parsedPolicy === "object" &&
    Array.isArray((parsedPolicy as MockTestRecipe).sections)
      ? (parsedPolicy as MockTestRecipe)
      : null;
  const recipeSection = recipe?.sections.find((s) => s.sectionId === sectionId);
  if (!recipeSection)
    return { ok: false, error: "Section not found in this exam's recipe." };

  let rules: { marks: number; negative: number };
  try {
    rules = JSON.parse(section.RulesJson);
  } catch {
    return { ok: false, error: "This section's marking rules are corrupted." };
  }

  return {
    ok: true,
    mockTestId: mtId,
    sectionId: secId,
    pool: recipeSection.pool,
    marks: rules.marks,
    negative: rules.negative,
    currentUser,
  };
}

export type AddQuestionsResult =
  | { ok: true; addedCount: number }
  | { ok: false; error: string };

// Appends picked questions to the end of the section's current order —
// skips any already present (defense; the picker's own excludeQuestionIds
// prop should already keep them out of the search results) and rejects the
// whole batch if it would overflow the section's pool, so one call never
// leaves a section partially applied.
export async function addQuestionsToSection(
  mockTestId: string,
  sectionId: string,
  questionIds: string[],
): Promise<AddQuestionsResult> {
  const ctx = await loadDraftSectionContext(mockTestId, sectionId);
  if (!ctx.ok) return ctx;

  const uniqueIds = [...new Set(questionIds)];
  if (!uniqueIds.length) return { ok: false, error: "No questions selected." };

  let idsBigInt: bigint[];
  try {
    idsBigInt = uniqueIds.map((qid) => BigInt(qid));
  } catch {
    return { ok: false, error: "Invalid question id." };
  }

  // Selects SeqNo (unfiltered by IsDeleted) as well as IsDeleted itself —
  // removeQuestionsFromSection leaves a removed row's SeqNo untouched, so a
  // prior removal can leave an inactive row still holding a low SeqNo. The
  // new max has to clear THAT too, not just the active rows, or a fresh
  // insert can collide with it on the (MockTestId, SectionId, SeqNo) key.
  const [allSectionRows, questions] = await Promise.all([
    prisma.testQuestion.findMany({
      where: { MockTestId: ctx.mockTestId, SectionId: ctx.sectionId },
      select: { QuestionId: true, SeqNo: true, IsDeleted: true },
    }),
    prisma.question.findMany({
      where: { QuestionId: { in: idsBigInt }, IsDeleted: false },
      select: { QuestionId: true, CurrentVersionId: true, Code: true },
    }),
  ]);
  const activeRows = allSectionRows.filter((r) => !r.IsDeleted);

  if (questions.length !== idsBigInt.length) {
    return {
      ok: false,
      error: "One or more selected questions could not be found.",
    };
  }

  const alreadyPicked = new Set(activeRows.map((r) => r.QuestionId.toString()));
  const toAdd = questions.filter(
    (q) => !alreadyPicked.has(q.QuestionId.toString()),
  );
  if (!toAdd.length) {
    return {
      ok: false,
      error: "The selected question(s) are already in this section.",
    };
  }

  const missingVersion = toAdd.find((q) => q.CurrentVersionId === null);
  if (missingVersion) {
    return {
      ok: false,
      error: `Question ${missingVersion.Code} has no published content yet.`,
    };
  }

  const remainingSlots = ctx.pool - activeRows.length;
  if (toAdd.length > remainingSlots) {
    return {
      ok: false,
      error: `This section has room for ${remainingSlots} more question(s); you selected ${toAdd.length}.`,
    };
  }

  // Preserve the order the caller selected them in.
  const orderById = new Map(uniqueIds.map((qid, i) => [qid, i]));
  toAdd.sort(
    (a, b) =>
      (orderById.get(a.QuestionId.toString()) ?? 0) -
      (orderById.get(b.QuestionId.toString()) ?? 0),
  );

  const maxSeqNoEver = allSectionRows.reduce(
    (max, r) => Math.max(max, r.SeqNo),
    0,
  );

  try {
    await prisma.$transaction(
      toAdd.map((q, i) =>
        prisma.testQuestion.create({
          data: {
            MockTestId: ctx.mockTestId,
            SectionId: ctx.sectionId,
            SeqNo: maxSeqNoEver + i + 1,
            QuestionId: q.QuestionId,
            VersionId: q.CurrentVersionId!,
            EffectiveMarks: ctx.marks,
            EffectiveNegative: ctx.negative,
            CreatedBy: ctx.currentUser.id,
            FranchiseId: ctx.currentUser.franchiseId,
          },
        }),
      ),
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to add the question(s).",
    };
  }

  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  return { ok: true, addedCount: toAdd.length };
}

export type SectionMutationResult = { ok: true } | { ok: false; error: string };

export type RemoveQuestionsResult =
  | { ok: true; removedCount: number }
  | { ok: false; error: string };

// Soft-delete only (single question or a bulk-checked batch — the picked
// list's per-row remove button and its "select rows, remove selected"
// bulk action both call this, with a one-element array for the former).
// Removed rows' SeqNo is left as-is rather than compacting the rest of the
// section — nothing requires picks to be a dense 1..N sequence, only that
// active rows stay uniquely ordered. The freed numbers are never reused
// blindly, though: both addQuestionsToSection and reorderSectionQuestions
// account for every row this section has ever had (not just the active
// ones) before picking a new SeqNo, so an old, untouched value can never
// get collided into later.
export async function removeQuestionsFromSection(
  mockTestId: string,
  sectionId: string,
  questionIds: string[],
): Promise<RemoveQuestionsResult> {
  const ctx = await loadDraftSectionContext(mockTestId, sectionId);
  if (!ctx.ok) return ctx;

  const uniqueIds = [...new Set(questionIds)];
  if (!uniqueIds.length) return { ok: false, error: "No questions selected." };

  let idsBigInt: bigint[];
  try {
    idsBigInt = uniqueIds.map((qid) => BigInt(qid));
  } catch {
    return { ok: false, error: "Invalid question id." };
  }

  const targets = await prisma.testQuestion.findMany({
    where: {
      MockTestId: ctx.mockTestId,
      SectionId: ctx.sectionId,
      QuestionId: { in: idsBigInt },
      IsDeleted: false,
    },
    select: { SeqNo: true },
  });
  if (!targets.length)
    return {
      ok: false,
      error: "None of the selected question(s) were found in this section.",
    };

  try {
    await prisma.testQuestion.updateMany({
      where: {
        MockTestId: ctx.mockTestId,
        SectionId: ctx.sectionId,
        SeqNo: { in: targets.map((t) => t.SeqNo) },
      },
      data: {
        IsDeleted: true,
        ModifiedBy: ctx.currentUser.id,
        ModifiedOn: new Date(),
      },
    });
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Failed to remove the question(s).",
    };
  }

  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  return { ok: true, removedCount: targets.length };
}

// Re-applies the section's own current SeqNo values — just permuted, never
// a fresh 1..N sequence — over its active rows in the caller's requested
// order. Used for "move up/down" and any future drag-to-reorder UI.
// (MockTestId, SectionId, SeqNo) is a primary key checked per-statement, so
// — same trick updateMockTestFromDraft uses for PaperSection.SeqNo — every
// active row is first bumped to a distinct placeholder to guarantee the
// final assignment pass can never transiently collide with another row's
// current SeqNo. That placeholder is derived from this section's lowest
// SeqNo ever (active or removed), not from each row's own SeqNo: a removed
// row's number can be reused by a later insert (see addQuestionsToSection),
// so an own-SeqNo-derived placeholder (e.g. `-SeqNo`) can collide with a
// removed row that originally held that same number.
export async function reorderSectionQuestions(
  mockTestId: string,
  sectionId: string,
  orderedQuestionIds: string[],
): Promise<SectionMutationResult> {
  const ctx = await loadDraftSectionContext(mockTestId, sectionId);
  if (!ctx.ok) return ctx;

  const allSectionRows = await prisma.testQuestion.findMany({
    where: { MockTestId: ctx.mockTestId, SectionId: ctx.sectionId },
    select: { QuestionId: true, SeqNo: true, IsDeleted: true },
  });
  const activeRows = allSectionRows.filter((r) => !r.IsDeleted);

  const isSamePickSet =
    orderedQuestionIds.length === activeRows.length &&
    orderedQuestionIds.every((qid) =>
      activeRows.some((r) => r.QuestionId.toString() === qid),
    );
  if (!isSamePickSet) {
    return {
      ok: false,
      error:
        "This section's question list is out of date — please refresh and try again.",
    };
  }
  if (!activeRows.length) return { ok: true };

  const floor = allSectionRows.reduce((min, r) => Math.min(min, r.SeqNo), 0);
  const bumpedSeqNoByQuestionId = new Map(
    activeRows.map((r, i) => [r.QuestionId.toString(), floor - 1 - i]),
  );
  const sortedSeqNos = activeRows.map((r) => r.SeqNo).sort((a, b) => a - b);

  try {
    await prisma.$transaction(
      activeRows.map((r) =>
        prisma.testQuestion.update({
          where: {
            MockTestId_SectionId_SeqNo: {
              MockTestId: ctx.mockTestId,
              SectionId: ctx.sectionId,
              SeqNo: r.SeqNo,
            },
          },
          data: {
            SeqNo: bumpedSeqNoByQuestionId.get(r.QuestionId.toString())!,
          },
        }),
      ),
    );

    await prisma.$transaction(
      orderedQuestionIds.map((qid, i) =>
        prisma.testQuestion.update({
          where: {
            MockTestId_SectionId_SeqNo: {
              MockTestId: ctx.mockTestId,
              SectionId: ctx.sectionId,
              SeqNo: bumpedSeqNoByQuestionId.get(qid)!,
            },
          },
          data: { SeqNo: sortedSeqNos[i] },
        }),
      ),
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reorder this section.",
    };
  }

  revalidatePath(`/exam-designer/question-pick/${mockTestId}`);
  return { ok: true };
}
