"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { CURRENT_USER_ID } from "@/app/lib/constants";
import { FALLBACK_CATALOG, MOCK_TEST_STATUS } from "@/app/lib/examConstants";
import {
  buildFilterJsonFromDraft,
  codeSlug,
  validateShapeDraft,
  validateTemplateDraft,
  type BlueprintFilterJson,
  type MockTestRecipe,
  type TemplateDraft,
} from "@/app/lib/examSchema";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function generateMockTestCode(): string {
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `MT-${rand}`;
}

// ExamBody/Program/Stage have no RowVer, so plain Prisma find-or-create is
// fine. Every exam shares this one fallback chain — there's no admin UI for
// the catalog yet, and real categorization already lives on the exam/
// template's own name.
async function resolveFallbackStageId(tx: Tx): Promise<bigint> {
  let body = await tx.examBody.findFirst({ where: { Name: FALLBACK_CATALOG.bodyName, IsDeleted: false } });
  if (!body) {
    body = await tx.examBody.create({ data: { Name: FALLBACK_CATALOG.bodyName, CreatedBy: CURRENT_USER_ID } });
  }

  let program = await tx.examProgram.findFirst({
    where: { BodyId: body.BodyId, Code: FALLBACK_CATALOG.programCode, IsDeleted: false },
  });
  if (!program) {
    program = await tx.examProgram.create({
      data: {
        BodyId: body.BodyId,
        Code: FALLBACK_CATALOG.programCode,
        Name: FALLBACK_CATALOG.programName,
        CreatedBy: CURRENT_USER_ID,
      },
    });
  }

  let stage = await tx.examStage.findFirst({
    where: { ProgramId: program.ProgramId, Code: FALLBACK_CATALOG.stageCode, IsDeleted: false },
  });
  if (!stage) {
    stage = await tx.examStage.create({
      data: {
        ProgramId: program.ProgramId,
        Code: FALLBACK_CATALOG.stageCode,
        Name: FALLBACK_CATALOG.stageName,
        SeqNo: 1,
        CreatedBy: CURRENT_USER_ID,
      },
    });
  }

  return stage.StageId;
}

// TestKind rows use a caller-supplied id (no autoincrement). Resolves by the
// exam's own chosen test kind code (e.g. "mock_test" vs some other kind
// picked in the designer — this is the "mock or not" decision), creating a
// new row with the next free id only if that exact code doesn't exist yet.
async function resolveTestKindId(tx: Tx, code: string, name: string): Promise<number> {
  const existing = await tx.testKind.findFirst({ where: { Code: code, IsDeleted: false } });
  if (existing) return existing.TestKindId;

  const highest = await tx.testKind.findFirst({ orderBy: { TestKindId: "desc" } });
  const nextId = (highest?.TestKindId ?? 0) + 1;
  const created = await tx.testKind.create({
    data: { TestKindId: nextId, Code: code, Name: name, CreatedBy: CURRENT_USER_ID },
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
  initialStatus: number = MOCK_TEST_STATUS.DRAFT
): Promise<bigint> {
  const stageId = await resolveFallbackStageId(tx);
  const testKind = filterJson.testKind ?? { code: "mock_test", name: "Mock Test" };
  const testKindId = await resolveTestKindId(tx, testKind.code, testKind.name);

  // MarkingScheme, ExamPaper, PaperSection all have a RowVer column — raw
  // SQL with OUTPUT INSERTED.<Id>, same workaround used throughout
  // app/lib/actions.ts for Question/QuestionVersion.
  const [scheme] = await tx.$queryRaw<{ SchemeId: bigint }[]>(
    Prisma.sql`INSERT INTO dbo.MarkingScheme (Name, RulesJson, CreatedBy)
      OUTPUT INSERTED.SchemeId
      VALUES (${filterJson.markingScheme.Name}, ${JSON.stringify(filterJson.markingScheme.RulesJson)}, ${CURRENT_USER_ID})`
  );

  // ExamPaper.Code is VARCHAR(30) — leave room for the "-" + 8 hex chars
  // that keep it unique across the many exams that can share one Name.
  const paperCode = `${codeSlug(filterJson.examPaper.Name).slice(0, 21)}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const [paper] = await tx.$queryRaw<{ PaperId: bigint }[]>(
    Prisma.sql`INSERT INTO dbo.ExamPaper (StageId, Code, Name, TotalMarks, DurationMin, IsQualifying, DefaultSchemeId, DefaultLocale, CreatedBy)
      OUTPUT INSERTED.PaperId
      VALUES (${stageId}, ${paperCode}, ${filterJson.examPaper.Name}, ${filterJson.examPaper.TotalMarks}, ${filterJson.examPaper.DurationMin}, ${filterJson.examPaper.IsQualifying ? 1 : 0}, ${scheme.SchemeId}, ${filterJson.examPaper.DefaultLocale}, ${CURRENT_USER_ID})`
  );

  const recipeSections: MockTestRecipe["sections"] = [];
  for (const s of filterJson.paperSections) {
    const [section] = await tx.$queryRaw<{ SectionId: bigint }[]>(
      Prisma.sql`INSERT INTO dbo.PaperSection (PaperId, Name, SeqNo, RulesJson, CreatedBy)
        OUTPUT INSERTED.SectionId
        VALUES (${paper.PaperId}, ${s.Name}, ${s.SeqNo}, ${JSON.stringify(s.RulesJson)}, ${CURRENT_USER_ID})`
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
  const publishedOnSql = initialStatus === MOCK_TEST_STATUS.PUBLISHED ? Prisma.sql`GETDATE()` : Prisma.sql`NULL`;
  const [mockTest] = await tx.$queryRaw<{ MockTestId: bigint }[]>(
    Prisma.sql`INSERT INTO dbo.MockTest (Code, PaperId, TestKindId, Name, Status, PublishedOn, SelectionPolicyJson, CreatedBy)
      OUTPUT INSERTED.MockTestId
      VALUES (${code}, ${paper.PaperId}, ${testKindId}, ${filterJson.examPaper.Name}, ${initialStatus}, ${publishedOnSql}, ${JSON.stringify(mockTestRecipe)}, ${CURRENT_USER_ID})`
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
  initialStatus: number = MOCK_TEST_STATUS.DRAFT
): Promise<CreateMockTestFromDraftResult> {
  const trimmedExamName = examName.trim();
  if (!trimmedExamName) return { ok: false, error: "Please name the exam." };

  const shapeErr = validateShapeDraft(draft);
  if (shapeErr) return { ok: false, error: shapeErr };

  const validStatuses = Object.values(MOCK_TEST_STATUS) as number[];
  if (!validStatuses.includes(initialStatus)) return { ok: false, error: "Invalid status." };

  const examFilterJson = buildFilterJsonFromDraft({ ...draft, name: trimmedExamName });

  let templateId: string | null = null;
  const templateName = saveAsTemplateName?.trim();
  if (templateName) {
    const templateFilterJson = buildFilterJsonFromDraft({ ...draft, name: templateName });
    try {
      const savedTemplate = await prisma.blueprintTemplate.create({
        data: { Name: templateName, FilterJson: JSON.stringify(templateFilterJson), CreatedBy: CURRENT_USER_ID },
      });
      templateId = savedTemplate.TemplateId.toString();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to save the template." };
    }
  }

  let mockTestId: bigint;
  try {
    mockTestId = await prisma.$transaction((tx) => materializeMockTest(tx, examFilterJson, templateId, initialStatus));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create the exam draft." };
  }

  revalidatePath("/exams/mock-tests");
  if (templateId) revalidatePath("/exams/templates");

  return { ok: true, mockTestId: mockTestId.toString(), templateId };
}

export type UpdateMockTestFromDraftResult =
  | { ok: true; mockTestId: string; templateId: string | null }
  | { ok: false; error: string };

// Edit-page counterpart to createMockTestFromDraft — updates the exam's own
// dedicated MarkingScheme/ExamPaper/PaperSection rows in place instead of
// materializing fresh ones (safe because those rows are never shared across
// exams to begin with). Only allowed while the exam is still a Draft, same
// gating the (not-yet-built) question picker will use for add/remove.
export async function updateMockTestFromDraft(
  mockTestId: string,
  examName: string,
  draft: TemplateDraft,
  saveAsTemplateName?: string
): Promise<UpdateMockTestFromDraftResult> {
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

  const existing = await prisma.mockTest.findFirst({ where: { MockTestId: id, IsDeleted: false } });
  if (!existing) return { ok: false, error: "Exam not found." };
  if (existing.Status !== MOCK_TEST_STATUS.DRAFT) return { ok: false, error: "Only draft exams can be edited." };

  const parsedPolicy: unknown = existing.SelectionPolicyJson ? JSON.parse(existing.SelectionPolicyJson) : null;
  const priorTemplateId =
    parsedPolicy && typeof parsedPolicy === "object" && "templateId" in (parsedPolicy as object)
      ? ((parsedPolicy as MockTestRecipe).templateId ?? null)
      : null;

  const filterJson = buildFilterJsonFromDraft({ ...draft, name: trimmedExamName });

  let templateId: string | null = null;
  const templateName = saveAsTemplateName?.trim();
  if (templateName) {
    const templateFilterJson = buildFilterJsonFromDraft({ ...draft, name: templateName });
    try {
      const savedTemplate = await prisma.blueprintTemplate.create({
        data: { Name: templateName, FilterJson: JSON.stringify(templateFilterJson), CreatedBy: CURRENT_USER_ID },
      });
      templateId = savedTemplate.TemplateId.toString();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to save the template." };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const testKindId = await resolveTestKindId(tx, draft.testKindCode.trim(), draft.testKindName.trim() || draft.testKindCode.trim());

      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.MarkingScheme
          SET Name = ${filterJson.markingScheme.Name}, RulesJson = ${JSON.stringify(filterJson.markingScheme.RulesJson)},
              ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
          WHERE SchemeId = (SELECT DefaultSchemeId FROM dbo.ExamPaper WHERE PaperId = ${existing.PaperId})`
      );

      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.ExamPaper
          SET Name = ${filterJson.examPaper.Name}, TotalMarks = ${filterJson.examPaper.TotalMarks}, DurationMin = ${filterJson.examPaper.DurationMin},
              ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
          WHERE PaperId = ${existing.PaperId}`
      );

      const currentSections = await tx.paperSection.findMany({ where: { PaperId: existing.PaperId, IsDeleted: false } });

      // PaperSection has a unique (PaperId, SeqNo) constraint that's checked
      // per-statement, not deferred to commit — reordering sections in place
      // can transiently collide with another row's current SeqNo. Bump every
      // existing row to a distinct negative placeholder first, then assign
      // final positions once nothing can clash.
      for (const cur of currentSections) {
        await tx.$executeRaw(
          Prisma.sql`UPDATE dbo.PaperSection SET SeqNo = ${-cur.SeqNo - 100000} WHERE SectionId = ${cur.SectionId}`
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
        const matchesExisting = s.sectionId && currentSections.some((c) => c.SectionId.toString() === s.sectionId);

        if (matchesExisting) {
          await tx.$executeRaw(
            Prisma.sql`UPDATE dbo.PaperSection
              SET Name = ${s.name.trim()}, SeqNo = ${seqNo}, RulesJson = ${rulesJson}, ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
              WHERE SectionId = ${BigInt(s.sectionId!)}`
          );
          keptSectionIds.add(s.sectionId!);
          recipeSections.push({ sectionId: s.sectionId!, name: s.name.trim(), questionType: s.questionType, pool: s.questions, mandatory: s.mandatory });
        } else {
          const [inserted] = await tx.$queryRaw<{ SectionId: bigint }[]>(
            Prisma.sql`INSERT INTO dbo.PaperSection (PaperId, Name, SeqNo, RulesJson, CreatedBy)
              OUTPUT INSERTED.SectionId
              VALUES (${existing.PaperId}, ${s.name.trim()}, ${seqNo}, ${rulesJson}, ${CURRENT_USER_ID})`
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
            Prisma.sql`UPDATE dbo.PaperSection SET IsDeleted = 1, ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE() WHERE SectionId = ${cur.SectionId}`
          );
        }
      }

      const recipe: MockTestRecipe = { version: 1, templateId: priorTemplateId, sections: recipeSections };

      await tx.$executeRaw(
        Prisma.sql`UPDATE dbo.MockTest
          SET Name = ${trimmedExamName}, TestKindId = ${testKindId}, SelectionPolicyJson = ${JSON.stringify(recipe)},
              ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
          WHERE MockTestId = ${id}`
      );
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update the exam." };
  }

  revalidatePath("/exams/mock-tests");
  revalidatePath(`/exams/mock-tests/${mockTestId}`);
  revalidatePath(`/exams/mock-tests/${mockTestId}/edit`);
  if (templateId) revalidatePath("/exams/templates");

  return { ok: true, mockTestId, templateId };
}

export type ChangeMockTestStatusResult = { ok: true } | { ok: false; error: string };

// Direct status change — Draft/Published/Archived, no gating on section
// fill-counts yet (that belongs with the question picker, not built yet).
// MockTest has a RowVer column, so this is a raw-SQL UPDATE like every other
// write to it.
export async function changeMockTestStatus(mockTestId: string, toStatus: number): Promise<ChangeMockTestStatusResult> {
  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return { ok: false, error: "Invalid exam id." };
  }

  const validStatuses = Object.values(MOCK_TEST_STATUS) as number[];
  if (!validStatuses.includes(toStatus)) return { ok: false, error: "Invalid status." };

  const existing = await prisma.mockTest.findFirst({ where: { MockTestId: id, IsDeleted: false } });
  if (!existing) return { ok: false, error: "Exam not found." };
  if (existing.Status === toStatus) return { ok: false, error: "Exam is already in that status." };

  if (toStatus === MOCK_TEST_STATUS.PUBLISHED) {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE dbo.MockTest
        SET Status = ${toStatus}, PublishedOn = GETDATE(), ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
        WHERE MockTestId = ${id}`
    );
  } else {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE dbo.MockTest
        SET Status = ${toStatus}, ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
        WHERE MockTestId = ${id}`
    );
  }

  revalidatePath("/exams/mock-tests");
  revalidatePath(`/exams/mock-tests/${mockTestId}`);

  return { ok: true };
}

export type DeleteMockTestResult = { ok: true } | { ok: false; error: string };

// Soft delete only, matching deleteQuestion's convention — flips IsDeleted
// so the exam drops out of every IsDeleted:false query without losing its
// history (any TestQuestion rows, if the picker has been used already).
export async function deleteMockTest(mockTestId: string): Promise<DeleteMockTestResult> {
  let id: bigint;
  try {
    id = BigInt(mockTestId);
  } catch {
    return { ok: false, error: "Invalid exam id." };
  }

  const existing = await prisma.mockTest.findFirst({ where: { MockTestId: id, IsDeleted: false } });
  if (!existing) return { ok: false, error: "Exam not found." };

  await prisma.$executeRaw(
    Prisma.sql`UPDATE dbo.MockTest
      SET IsDeleted = 1, ModifiedBy = ${CURRENT_USER_ID}, ModifiedOn = GETDATE()
      WHERE MockTestId = ${id}`
  );

  revalidatePath("/exams/mock-tests");

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
export async function createBlueprintTemplate(draft: TemplateDraft): Promise<CreateBlueprintTemplateResult> {
  const err = validateTemplateDraft(draft);
  if (err) return { ok: false, error: err };

  const filterJson = buildFilterJsonFromDraft(draft);

  try {
    const template = await prisma.blueprintTemplate.create({
      data: {
        Name: draft.name.trim(),
        FilterJson: JSON.stringify(filterJson),
        CreatedBy: CURRENT_USER_ID,
      },
    });
    revalidatePath("/exams/templates");
    revalidatePath("/exams/mock-tests/new");
    return { ok: true, templateId: template.TemplateId.toString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save the template." };
  }
}
