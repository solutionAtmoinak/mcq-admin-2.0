import { callMigrationService } from "@/app/lib/db/migrationService";
import { NextResponse } from "next/server";

// Endpoint backing /migration/json's "Extract by Section ID" option. Calls
// Mode 1 (extractBySectionId) of spMcqMigrationService.sql, which reads the
// legacy TblMasterMCQ4Question tree directly (DBDthLmsPro) for one
// MCQSectionId and returns rows already shaped to Mode 2's input contract —
// see mcq-admin/sql/spMcqMigrationService.sql for the full row shape. This
// replaces manually running migrate-section-566-preview.sql in SSMS and
// uploading its output as a file.
export async function GET(request: Request) {
  const sectionIdRaw = new URL(request.url).searchParams.get("sectionId");
  const sectionId = sectionIdRaw ? Number(sectionIdRaw) : NaN;
  if (!Number.isInteger(sectionId) || sectionId <= 0) {
    return NextResponse.json(
      { error: "sectionId must be a positive integer." },
      { status: 400 },
    );
  }

  const result = await callMigrationService<unknown[] | string>(1, {
    SectionId: sectionId,
  });

  // console.log({ result });

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
