import { NextResponse } from "next/server";
import { callMigrationService } from "@/app/lib/db/migrationService";
import { getServiceValue } from "@/app/lib/db/serviceConfig";
import { createQuestionLot } from "@/app/lib/questions/actions";

// Endpoint backing /migration/json (the sidebar's Migration -> "From JSON"
// page). Accepts a migration JSON file's contents — each row already
// carrying Mode 2's exact PresentationJson/AnswerJson/SearchText contract
// (mirrors buildContent()/buildSearchText() in app/lib/questions/schema.ts)
// — and calls Mode 2 (createQuestionsBulk) of the dedicated
// spMcqMigrationService.sql, in a SINGLE call with no batch-size cap. Mode 2
// runs in one transaction, so this is all-or-nothing: a mid-batch failure
// rolls the whole insert back, nothing partial is left behind.
//
// Rows can come from an uploaded file, or from /api/migration/extract (Mode
// 1 of the same SP) — see mcq-admin/sql/migrate-section-566-preview.sql /
// spMcqMigrationService.sql for the row-shape rationale.
//
// Known gap: Question.CreatedBy is stamped server-side from the
// authenticated caller, not from the request body — so questions created
// here carry your own user. Run a cleanup UPDATE scoped to the returned
// lotId afterward if a different CreatedBy label is wanted.

type ImportRow = {
  LegacyQuestionId?: number;
  TypeCode: string;
  Difficulty: number;
  // The .NET executor doesn't reliably keep these as JSON-text strings —
  // TagsJson in particular has been observed coming back as an already-
  // parsed array rather than the string Mode 2 expects, even though
  // PresentationJson/AnswerJson (built the same way, SQL-side) currently
  // don't. Typed loosely and normalized below rather than trusted as string.
  PresentationJson: unknown;
  AnswerJson: unknown;
  SearchText: string;
  TagsJson?: unknown;
};

type Mode2Question = {
  Code: string;
  TypeCode: string;
  Difficulty: number;
  Status: number;
  EstSolveSec: number | null;
  PresentationJson: string;
  AnswerJson: string;
  SearchText: string;
  Tags: { Key: string; Value: string }[];
};

function isJsonish(value: unknown): boolean {
  return typeof value === "string" || (typeof value === "object" && value !== null);
}

function isImportRow(value: unknown): value is ImportRow {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.TypeCode === "string" &&
    typeof r.Difficulty === "number" &&
    isJsonish(r.PresentationJson) &&
    isJsonish(r.AnswerJson) &&
    typeof r.SearchText === "string"
  );
}

// Mode 2 requires PresentationJson/AnswerJson as JSON-TEXT strings (it
// stores them verbatim and hashes them) — re-stringify if this row's value
// somehow arrived as an already-parsed object instead.
function toJsonText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function toTagArray(value: unknown): { Key: string; Value: string }[] {
  if (Array.isArray(value)) return value as { Key: string; Value: string }[];
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    lotId?: string;
    lotNo?: string;
    questions?: unknown;
  } | null;

  if (!body || !Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json({ error: "No questions in request body." }, { status: 400 });
  }
  const rows = body.questions;
  const invalidIndex = rows.findIndex((r) => !isImportRow(r));
  if (invalidIndex !== -1) {
    return NextResponse.json(
      { error: `Row ${invalidIndex + 1} is missing a required field (TypeCode/Difficulty/PresentationJson/AnswerJson/SearchText).` },
      { status: 400 },
    );
  }
  const validRows = rows as ImportRow[];

  const approvedStatus = await getServiceValue("QUESTION_STATUS", "APPROVED");

  let lotId = body.lotId;
  let lotNo = body.lotNo;
  if (!lotId) {
    const lot = await createQuestionLot();
    if (!lot.ok) {
      return NextResponse.json({ error: lot.error }, { status: 500 });
    }
    lotId = lot.lotId;
    lotNo = lot.lotNo;
  }

  const questions: Mode2Question[] = validRows.map((row) => {
    let tags = toTagArray(row.TagsJson);
    if (row.LegacyQuestionId != null) {
      tags = [...tags, { Key: "LegacyId", Value: String(row.LegacyQuestionId) }];
    }

    return {
      Code: "",
      TypeCode: row.TypeCode,
      Difficulty: row.Difficulty,
      Status: approvedStatus,
      EstSolveSec: null,
      PresentationJson: toJsonText(row.PresentationJson),
      AnswerJson: toJsonText(row.AnswerJson),
      SearchText: row.SearchText,
      Tags: tags,
    };
  });

  const result = await callMigrationService<{ Created: { Code: string; QuestionId: string }[] } | string>(2, {
    LotId: lotId,
    Questions: questions,
  });

  if (typeof result === "string" || !result) {
    return NextResponse.json(
      {
        lotId,
        lotNo,
        error: typeof result === "string" ? result : "Unknown failure calling Mode 2.",
      },
      { status: 500 },
    );
  }

  const created = result.Created.map((c, i) => ({
    legacyId: validRows[i]?.LegacyQuestionId ?? null,
    code: c.Code,
    questionId: c.QuestionId,
  }));

  return NextResponse.json({
    lotId,
    lotNo,
    totalRows: validRows.length,
    createdCount: created.length,
    created,
  });
}
