"use client";

// TEMPORARY — one-off UI trigger for /api/temp-migrate-566 (Mode 33 bulk
// import of legacy TblMasterMCQ4Question, MCQSectionId = 566). Delete this
// file and its import in page.tsx, and the route itself, once the migration
// is done and verified.

import { useState } from "react";

type DryRunResult = {
  totalRows: number;
  firstRow: unknown;
  lastRow: unknown;
};

type MigrateResult =
  | {
      lotId: string;
      lotNo?: string;
      totalRows: number;
      createdCount: number;
      created: { legacyId: number | null; code: string; questionId: string }[];
    }
  | { lotId?: string; lotNo?: string; error: string };

export function TempMigrateSection566Button() {
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [result, setResult] = useState<MigrateResult | null>(null);

  async function runDryRun() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/temp-migrate-566", { method: "GET" });
      setDryRun(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function runMigration() {
    if (
      !confirm(
        "This inserts all Section 566 questions into the LIVE Question Bank via Mode 33 (single transaction). Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setDryRun(null);
    try {
      const res = await fetch("/api/temp-migrate-566", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Temporary — remove after migration
      </p>
      <p className="mt-1 text-sm text-amber-800">
        One-off import of the legacy Section 566 question bank (Mode 33).
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runDryRun}
          disabled={busy}
          className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          Dry run (check data file)
        </button>
        <button
          type="button"
          onClick={runMigration}
          disabled={busy}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? "Running…" : "Run migration"}
        </button>
      </div>

      {dryRun && (
        <pre className="mt-3 max-h-40 overflow-auto rounded bg-white p-2 text-xs text-zinc-700">
          {JSON.stringify(dryRun, null, 2)}
        </pre>
      )}
      {result && (
        <pre className="mt-3 max-h-60 overflow-auto rounded bg-white p-2 text-xs text-zinc-700">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
