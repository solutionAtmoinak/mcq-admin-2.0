import { callMigrationService } from "@/app/lib/db/migrationService";
import { NextResponse } from "next/server";

// Endpoint backing /migration/json's "Extract by Section ID" option. Calls
// Mode 1 (extractBySectionId) of spMcqMigrationService.sql, which reads the
// legacy TblMasterMCQ4Question tree directly (DBDthLmsPro) for one
// MCQSectionId and returns rows already shaped to Mode 2's input contract —
// see mcq-admin/sql/spMcqMigrationService.sql for the full row shape. This
// replaces manually running migrate-section-566-preview.sql in SSMS and
// uploading its output as a file.
//
// Optional `questionIds` query param (comma-separated bigints) scopes Mode 1
// to just that subset of the section instead of the whole thing — used by
// ExtractPanel to page through a large section in chunks (via
// /api/migration/extract-ids for the full id list first) rather than
// building JSON for 1000+ rows in one call, which times out in SQL.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sectionIdRaw = params.get("sectionId");
  const sectionId = sectionIdRaw ? Number(sectionIdRaw) : NaN;
  if (!Number.isInteger(sectionId) || sectionId <= 0) {
    return NextResponse.json(
      { error: "sectionId must be a positive integer." },
      { status: 400 },
    );
  }

  const questionIdsRaw = params.get("questionIds");
  const questionIds = questionIdsRaw
    ? questionIdsRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    : undefined;
  if (questionIdsRaw && (!questionIds || questionIds.length === 0)) {
    return NextResponse.json({ error: "questionIds did not contain any valid ids." }, { status: 400 });
  }

  const result = await callMigrationService<unknown[] | string>(1, {
    SectionId: sectionId,
    QuestionIds: questionIds,
  });

  if (typeof result === "string") {
    return NextResponse.json({ error: result }, { status: 500 });
  }
  if (!Array.isArray(result)) {
    return NextResponse.json(
      { error: "Unknown failure calling Mode 1." },
      { status: 500 },
    );
  }
  if (result.length === 0) {
    return NextResponse.json(
      { error: `No active questions found for MCQSectionId ${sectionId}.` },
      { status: 404 },
    );
  }

  return NextResponse.json({ sectionId, rows: result });
}
