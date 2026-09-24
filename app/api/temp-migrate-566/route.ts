import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { callTeacherService } from "@/app/lib/db/teacherService";
import { getServiceValue } from "@/app/lib/db/serviceConfig";
import { createQuestionLot } from "@/app/lib/questions/actions";

// TEMPORARY, one-off migration endpoint for the legacy TblMasterMCQ4Question
// (MCQSectionId = 566) import — see mcq-admin/sql/migrate-section-566-preview.sql
// (source query) and mcq-admin/sql/old-mcq-json.json (its saved output,
// 1340 rows). Delete this route once the migration is done and verified.
//
// Each row's PresentationJson/AnswerJson/SearchText are already built to
// Mode 13's exact contract (mirrors buildContent()/buildSearchText() in
// app/lib/questions/schema.ts) by the SQL query, so this route skips
// buildContent() entirely. Calls Mode 33 (spMcqTeacherService.sql) — a copy
// of Mode 13 with the 200-row batch cap removed, for exactly this kind of
// one-off bulk import — in a SINGLE call with all rows at once. Mode 33
// (like Mode 13) runs inside one transaction, so this is all-or-nothing: a
// mid-batch failure rolls the whole insert back, nothing partial is left.
// Mode 33 must be deployed first: run
// mcq-admin/sql/deploy-merged-modes-1-33.sql against DBDTHMCQPRO.
//
// Known gap (see plan): Question.CreatedBy is stamped server-side from the
// authenticated caller, not from the JSON payload -- so questions created
// here will carry your own user, not "data-migration". Run the documented
// cleanup UPDATE (scoped to the returned lotId) afterward if you want that
// literal label instead.

const DATA_FILE = path.join(process.cwd(), "sql", "old-mcq-json.json");

type PreviewRow = {
  LegacyQuestionId: number;
  TypeCode: string;
  Difficulty: number;
  Marks: number;
  Negative: number;
  PresentationJson: string;
  AnswerJson: string;
  SearchText: string;
  TagsJson: string;
};

type Mode33Question = {
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

async function loadRows(): Promise<PreviewRow[]> {
  const raw = await readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as PreviewRow[];
}

// GET: dry-run/status check -- no writes, just confirms the data file loads.
// Hit this first.
export async function GET() {
  const rows = await loadRows();
  return NextResponse.json({
    totalRows: rows.length,
    firstRow: rows[0] ?? null,
    lastRow: rows[rows.length - 1] ?? null,
  });
}

// POST body (optional): { lotId?: string; lotNo?: string }
// - First call: send {} -- mints a new QuestionLot and inserts all rows.
// - If this ever needs re-running against the SAME lot (e.g. after fixing
//   the source data and re-migrating), pass the previously returned lotId
//   so everything still lands under one lot -- but note there is no
//   duplicate-row guard, so only do this after confirming the prior attempt
//   inserted nothing (check `SELECT COUNT(*) FROM Question WHERE LotId = ...`).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    lotId?: string;
    lotNo?: string;
  };

  const rows = await loadRows();
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows in old-mcq-json.json." }, { status: 400 });
  }

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

  const questions: Mode33Question[] = rows.map((row) => {
    let tags: { Key: string; Value: string }[] = [];
    try {
      tags = JSON.parse(row.TagsJson);
    } catch {
      tags = [];
    }
    tags.push({ Key: "LegacyId", Value: String(row.LegacyQuestionId) });

    return {
      Code: "",
      TypeCode: row.TypeCode,
      Difficulty: row.Difficulty,
      Status: approvedStatus,
      EstSolveSec: null,
      PresentationJson: row.PresentationJson,
      AnswerJson: row.AnswerJson,
      SearchText: row.SearchText,
      Tags: tags,
    };
  });

  const result = await callTeacherService<{ Created: { Code: string; QuestionId: string }[] } | string>(33, {
    LotId: lotId,
    Questions: questions,
  });

  if (typeof result === "string" || !result) {
    return NextResponse.json(
      {
        lotId,
        lotNo,
        error: typeof result === "string" ? result : "Unknown failure calling Mode 33.",
      },
      { status: 500 },
    );
  }

  const created = result.Created.map((c, i) => ({
    legacyId: rows[i]?.LegacyQuestionId ?? null,
    code: c.Code,
    questionId: c.QuestionId,
  }));

  return NextResponse.json({
    lotId,
    lotNo,
    totalRows: rows.length,
    createdCount: created.length,
    created,
  });
}
