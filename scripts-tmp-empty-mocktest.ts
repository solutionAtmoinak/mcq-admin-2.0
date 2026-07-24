import "dotenv/config";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "./app/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaMssql({
    server: process.env.DATABASE_HOST!,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
  }),
});

async function main() {
  const mockTests = await prisma.mockTest.findMany({ select: { MockTestId: true, Name: true, PaperId: true } });
  console.log("MockTest rows to purge:", mockTests.map((m) => ({ id: m.MockTestId.toString(), name: m.Name, paperId: m.PaperId.toString() })));

  if (!mockTests.length) {
    console.log("Nothing to do — MockTest is already empty.");
    return;
  }

  const mockTestIds = mockTests.map((m) => m.MockTestId);
  const paperIds = [...new Set(mockTests.map((m) => m.PaperId.toString()))].map((s) => BigInt(s));

  await prisma.$transaction(async (tx) => {
    const attempts = await tx.attempt.findMany({ where: { MockTestId: { in: mockTestIds } }, select: { AttemptId: true } });
    const attemptIds = attempts.map((a) => a.AttemptId);
    if (attemptIds.length) {
      const delAA = await tx.attemptAnswer.deleteMany({ where: { AttemptId: { in: attemptIds } } });
      const delAE = await tx.attemptEvent.deleteMany({ where: { AttemptId: { in: attemptIds } } });
      const delAS = await tx.attemptSection.deleteMany({ where: { AttemptId: { in: attemptIds } } });
      const delA = await tx.attempt.deleteMany({ where: { AttemptId: { in: attemptIds } } });
      console.log("Deleted attempt-related rows:", { delAA: delAA.count, delAE: delAE.count, delAS: delAS.count, delA: delA.count });
    }

    const delTQ = await tx.testQuestion.deleteMany({ where: { MockTestId: { in: mockTestIds } } });
    const delTP = await tx.testPool.deleteMany({ where: { MockTestId: { in: mockTestIds } } });
    console.log("Deleted TestQuestion:", delTQ.count, "TestPool:", delTP.count);

    const delQM = await tx.questionMarks.deleteMany({ where: { PaperId: { in: paperIds } } });
    console.log("Deleted QuestionMarks:", delQM.count);

    for (const id of mockTestIds) {
      await tx.$executeRawUnsafe(`DELETE FROM dbo.MockTest WHERE MockTestId = ${id}`);
    }
    console.log("Deleted MockTest rows:", mockTestIds.length);

    for (const paperId of paperIds) {
      await tx.$executeRawUnsafe(`DELETE FROM dbo.PaperSection WHERE PaperId = ${paperId}`);
    }
    console.log("Deleted PaperSection rows for papers:", paperIds.map(String));

    const papers = await tx.examPaper.findMany({ where: { PaperId: { in: paperIds } }, select: { PaperId: true, DefaultSchemeId: true } });
    const schemeIds = [...new Set(papers.map((p) => p.DefaultSchemeId).filter((x): x is bigint => x !== null))];

    for (const paperId of paperIds) {
      await tx.$executeRawUnsafe(`DELETE FROM dbo.ExamPaper WHERE PaperId = ${paperId}`);
    }
    console.log("Deleted ExamPaper rows:", paperIds.map(String));

    for (const schemeId of schemeIds) {
      const stillUsed = await tx.examPaper.count({ where: { DefaultSchemeId: schemeId } });
      if (stillUsed === 0) {
        await tx.$executeRawUnsafe(`DELETE FROM dbo.MarkingScheme WHERE SchemeId = ${schemeId}`);
        console.log("Deleted MarkingScheme", schemeId.toString());
      } else {
        console.log("Kept MarkingScheme", schemeId.toString(), "— still referenced by", stillUsed, "paper(s).");
      }
    }
  });

  const remaining = await prisma.mockTest.count();
  console.log("MockTest rows remaining:", remaining);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
