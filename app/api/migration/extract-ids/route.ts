import { callMigrationService } from "@/app/lib/db/migrationService";
import { NextResponse } from "next/server";

// Endpoint backing /migration/json's "Extract by Section ID" option. Calls
// Mode 3 (listSectionQuestionIds) of spMcqMigrationService-deploy.sql — a cheap,
// join-free lookup of just MCQQuestionId for one section, so large sections
// (1000+ questions) can be paged through via /api/migration/extract's
// questionIds filter instead of timing out on one big Mode 1 call.
export async function GET(request: Request) {
  const sectionIdRaw = new URL(request.url).searchParams.get("sectionId");
  const sectionId = sectionIdRaw ? Number(sectionIdRaw) : NaN;
  if (!Number.isInteger(sectionId) || sectionId <= 0) {
    return NextResponse.json({ error: "sectionId must be a positive integer." }, { status: 400 });
  }

  const result = await callMigrationService<{ MCQQuestionId: number }[] | string>(3, {
    SectionId: sectionId,
  });

  if (typeof result === "string") {
    return NextResponse.json({ error: result }, { status: 500 });
  }
  if (!Array.isArray(result)) {
    return NextResponse.json({ error: "Unknown failure calling Mode 3." }, { status: 500 });
  }
  if (result.length === 0) {
    return NextResponse.json(
      { error: `No active questions found for MCQSectionId ${sectionId}.` },
      { status: 404 },
    );
  }

  const questionIds = result.map((r) => r.MCQQuestionId);
  return NextResponse.json({ sectionId, questionIds });
}
