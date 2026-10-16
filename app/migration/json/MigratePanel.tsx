"use client";

import { useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Modal, Popover, Whisper } from "rsuite";
import { JsonView, allExpanded, darkStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import {
  FiAlertTriangle,
  FiBookOpen,
  FiCheckCircle,
  FiCopy,
  FiEye,
  FiFileText,
  FiGitMerge,
  FiLoader,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { toPlainText } from "@/app/components/common/MathText";
import {
  buttonClass,
  cardClass,
  iconButtonClass,
  primaryButtonClass,
} from "@/app/components/common/ui";
import { QUESTION_TYPE_LABELS, isOptionBasedType, type QuestionTypeCode } from "@/app/lib/questions/schema";
import { notify } from "@/app/lib/shared/toast";

const PAGE_SIZE = 25;

// Loosely-typed shape of one row in the uploaded migration JSON — matches
// mcq-admin/sql/migrate-section-566-preview.sql's output columns. Extra
// fields in the file are ignored; only these are read.
//
// PresentationJson/AnswerJson/TagsJson are typed `unknown`, not `string`:
// the .NET executor doesn't reliably keep them as JSON-text strings —
// TagsJson in particular has been observed coming back as an already-parsed
// array rather than a string, even though PresentationJson/AnswerJson
// (built the same way, SQL-side) currently come through fine. parseRow()
// below tolerates either shape for all three.
type RawRow = {
  LegacyQuestionId?: number;
  TypeCode: string;
  Difficulty: number;
  Marks?: number;
  Negative?: number;
  PresentationJson: unknown;
  AnswerJson: unknown;
  SearchText: string;
  TagsJson?: unknown;
  // Mode 1's case-study marker for a passage-linked question (null/absent
  // for an ordinary question) — see spMcqMigrationService-deploy.sql's
  // Mode 1/Mode 2 headers. {"key","title","text","media"}; every row that
  // shares a legacy passage carries the same "key".
  CaseStudyJson?: unknown;
};

type ParsedCaseStudy = {
  key: string;
  title?: string;
  text?: string;
  media?: unknown;
};

type ParsedPresentation = {
  stem?: string;
  options?: { id: string; text: string; media?: unknown }[];
  media?: unknown;
  responseType?: string;
};

type ParsedAnswer = {
  correct?: unknown;
  marks?: number;
  negative?: number;
  explanation?: string;
  explanationMedia?: unknown;
};

type ParsedRow = {
  index: number;
  raw: RawRow;
  presentation: ParsedPresentation | null;
  answer: ParsedAnswer | null;
  tags: { Key: string; Value: string }[];
  caseStudy: ParsedCaseStudy | null;
  warnings: string[];
};

type ImportResult = {
  lotId: string;
  lotNo?: string;
  totalRows: number;
  createdCount: number;
  created: { legacyId: number | null; code: string; questionId: string }[];
};

function hasEmptyCorrect(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || value === "";
}

// Parses a field that SHOULD be a JSON-text string, but tolerates it
// already having been parsed upstream (see RawRow's comment) — returns
// null only on a genuine failure (empty/malformed string).
function parseMaybeJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseRow(raw: RawRow, index: number): ParsedRow {
  const warnings: string[] = [];
  let tags: { Key: string; Value: string }[] = [];

  const presentation = parseMaybeJson<ParsedPresentation>(raw.PresentationJson);
  if (!presentation) warnings.push("PresentationJson is not valid JSON.");
  const answer = parseMaybeJson<ParsedAnswer>(raw.AnswerJson);
  if (!answer) warnings.push("AnswerJson is not valid JSON.");
  if (raw.TagsJson) {
    const parsedTags = parseMaybeJson<{ Key: string; Value: string }[]>(raw.TagsJson);
    if (parsedTags) tags = parsedTags;
    else warnings.push("TagsJson is not valid JSON.");
  }

  let caseStudy: ParsedCaseStudy | null = null;
  if (raw.CaseStudyJson != null) {
    caseStudy = parseMaybeJson<ParsedCaseStudy>(raw.CaseStudyJson);
    if (!caseStudy) warnings.push("CaseStudyJson is not valid JSON.");
  }

  if (!presentation?.stem?.trim()) warnings.push("Missing stem.");
  if (isOptionBasedType(raw.TypeCode) && (presentation?.options?.length ?? 0) < 2) {
    warnings.push("Fewer than 2 options.");
  }
  if (answer && hasEmptyCorrect(answer.correct)) warnings.push("No correct answer set.");

  return { index, raw, presentation, answer, tags, caseStudy, warnings };
}

// Dedicated "View" column button — opens the row's FULL raw JSON
// (Presentation/Answer/Tags, exactly as parsed), not a rendered question
// preview, so a data problem (like a missing "correct") is visible directly
// in this shape, without needing devtools. Rendered with react-json-view-lite
// for a proper collapsible tree instead of a flat <pre> dump.
function ViewJsonButton({ r }: { r: ParsedRow }) {
  const [open, setOpen] = useState(false);
  const label = `Legacy #${r.raw.LegacyQuestionId ?? r.index + 1}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={iconButtonClass}
        aria-label={`View full JSON for ${label}`}
        title="View full JSON"
      >
        <FiEye size={13} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm">
        <Modal.Header>
          <Modal.Title>{label}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="max-h-[40vh] overflow-auto rounded-md bg-zinc-900 text-xs">
            <JsonView
              data={{
                TypeCode: r.raw.TypeCode,
                Difficulty: r.raw.Difficulty,
                Presentation: r.presentation,
                Answer: r.answer,
                Tags: r.tags,
                CaseStudy: r.caseStudy,
                SearchText: r.raw.SearchText,
              }}
              style={darkStyles}
              shouldExpandNode={allExpanded}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button className={buttonClass} onClick={() => setOpen(false)}>
            Close
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

// Click-triggered popover listing every warning this row has, instead of a
// bare native `title` tooltip — readable on click (or tap on mobile), and
// can show more than one line legibly.
function WarningTrigger({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Whisper
      placement="left"
      trigger="click"
      speaker={
        <Popover title="Data warning(s)">
          <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Popover>
      }
    >
      <button
        type="button"
        className="inline-flex items-center justify-center text-amber-500 hover:text-amber-600"
        aria-label={`${warnings.length} data warning(s)`}
      >
        <FiAlertTriangle size={14} />
      </button>
    </Whisper>
  );
}

// Click-triggered popover identifying this row as part of a case study
// (shared legacy passage) — shows the auto-derived title/paragraph so it's
// clear what group this question will be linked to on import, same
// click-to-open pattern as WarningTrigger.
function CaseStudyTrigger({ caseStudy }: { caseStudy: ParsedCaseStudy }) {
  return (
    <Whisper
      placement="left"
      trigger="click"
      speaker={
        <Popover title="Case study">
          <p className="max-w-xs text-xs font-medium text-zinc-800">{caseStudy.title || "(untitled)"}</p>
          {caseStudy.text && (
            <p className="mt-1 max-w-xs text-xs text-zinc-600">{toPlainText(caseStudy.text).slice(0, 200)}</p>
          )}
        </Popover>
      }
    >
      <button
        type="button"
        className="inline-flex items-center justify-center text-violet-500 hover:text-violet-600"
        aria-label="Part of a case study"
      >
        <FiBookOpen size={14} />
      </button>
    </Whisper>
  );
}

// Section 2 — upload a migration JSON file (e.g. one downloaded from
// ExtractPanel), review it, then confirm to send it to Mode 2
// (createQuestionsBulk) of spMcqMigrationService in one uncapped batch.
export default function MigratePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const warningCount = useMemo(() => rows?.filter((r) => r.warnings.length > 0).length ?? 0, [rows]);
  const caseStudyStats = useMemo(() => {
    if (!rows) return { questionCount: 0, groupCount: 0 };
    const keys = new Set<string>();
    let questionCount = 0;
    for (const r of rows) {
      if (!r.caseStudy) continue;
      questionCount++;
      keys.add(r.caseStudy.key);
    }
    return { questionCount, groupCount: keys.size };
  }, [rows]);
  const typeCounts = useMemo(() => {
    if (!rows) return [] as { code: string; count: number }[];
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.raw.TypeCode, (map.get(r.raw.TypeCode) ?? 0) + 1);
    return [...map.entries()].map(([code, count]) => ({ code, count }));
  }, [rows]);

  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const pageRows = rows ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];

  function loadRows(data: unknown[]) {
    const parsed = (data as RawRow[]).map((raw, i) => parseRow(raw, i));
    setRows(parsed);
    setPage(1);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.length === 0) {
        notify("File must contain a non-empty JSON array of questions.", "error");
        setRows(null);
        return;
      }
      setFileName(file.name);
      loadRows(data);
    } catch {
      notify("Could not parse this file as JSON.", "error");
      setRows(null);
    }
  }

  function handleClear() {
    setRows(null);
    setResult(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleConfirmImport() {
    if (!rows) return;

    const confirmText =
      warningCount > 0
        ? `${rows.length} question(s), including ${warningCount} with a data warning (they will still be imported as-is). This writes directly to the live Question Bank. Continue?`
        : `${rows.length} question(s) will be imported into the live Question Bank in one batch. Continue?`;

    const confirmed = await Swal.fire({
      title: "Confirm import",
      text: confirmText,
      icon: warningCount > 0 ? "warning" : "question",
      showCancelButton: true,
      confirmButtonText: "Import",
      cancelButtonText: "Cancel",
    });
    if (!confirmed.isConfirmed) return;

    setImporting(true);
    try {
      const res = await fetch("/api/migration/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: rows.map((r) => r.raw) }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error ?? "Import failed.", "error");
        return;
      }
      setResult(data as ImportResult);
      notify(`Imported ${data.createdCount} question(s).`, "success");
    } catch {
      notify("Import request failed — check your connection and try again.", "error");
    } finally {
      setImporting(false);
    }
  }

  function copyLotNo() {
    if (!result?.lotNo) return;
    navigator.clipboard?.writeText(result.lotNo).then(
      () => notify("Lot No copied.", "success"),
      () => notify("Could not copy — select and copy manually.", "error"),
    );
  }

  if (result) {
    return (
      <section className={cardClass}>
        <div className="flex items-center gap-2 text-emerald-700">
          <FiCheckCircle size={20} />
          <h2 className="text-base font-semibold">Import complete</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {result.createdCount} of {result.totalRows} question(s) created.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div>
            <span className="text-lg font-semibold uppercase tracking-wide text-emerald-700">Lot No: </span>
            <span className="font-mono text-lg font-semibold text-emerald-900">{result.lotNo ?? "—"}</span>
          </div>
          <button type="button" onClick={copyLotNo} className={`${buttonClass} inline-flex items-center gap-1.5`}>
            <FiCopy size={13} /> Copy
          </button>
        </div>

        <div className="mt-4 max-h-72 overflow-auto rounded-md border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Legacy ID</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Question ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {result.created.map((c) => (
                <tr key={c.questionId}>
                  <td className="px-3 py-1.5 text-zinc-500">{c.legacyId ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono">{c.code}</td>
                  <td className="px-3 py-1.5 font-mono">{c.questionId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={handleClear} className={`${primaryButtonClass} mt-4`}>
          Start another import
        </button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 bg-linear-to-r from-violet-50 to-white px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white shadow-sm">
          2
        </span>
        <FiGitMerge className="shrink-0 text-violet-500" size={20} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-violet-950">Migrate to the Question Bank</h2>
          <p className="text-xs text-violet-700/80">
            Upload a migration JSON file (e.g. one downloaded from Section 1 above) to review and
            import it.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-violet-100 px-5 py-4">
        <label
          className={`${buttonClass} inline-flex cursor-pointer items-center gap-1.5 ${importing ? "pointer-events-none opacity-50" : ""}`}
        >
          <FiUploadCloud size={14} />
          Upload JSON file
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            disabled={importing}
            onChange={handleFileChange}
          />
        </label>

        {fileName && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
            <FiFileText size={12} />
            {fileName}
          </span>
        )}

        {rows && (
          <button
            type="button"
            onClick={handleClear}
            disabled={importing}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiX size={12} /> Clear
          </button>
        )}
      </div>

      {!rows && (
        <p className="border-t border-violet-100 px-5 py-6 text-center text-sm text-zinc-400">
          No data loaded yet — upload a migration JSON file to begin.
        </p>
      )}

      {rows && (
        <>
          <div className="flex flex-wrap gap-4 border-t border-violet-100 px-5 py-3 text-sm text-zinc-600">
            <span>
              <strong className="text-zinc-900">{rows.length}</strong> question(s) total
            </span>
            {typeCounts.map((t) => (
              <span key={t.code}>
                <strong className="text-zinc-900">{t.count}</strong>{" "}
                {QUESTION_TYPE_LABELS[t.code as QuestionTypeCode] ?? t.code}
              </span>
            ))}
            {caseStudyStats.questionCount > 0 && (
              <span className="inline-flex items-center gap-1 text-violet-700">
                <FiBookOpen size={13} />
                <strong className="text-violet-900">{caseStudyStats.groupCount}</strong> case stud
                {caseStudyStats.groupCount === 1 ? "y" : "ies"} (
                <strong className="text-violet-900">{caseStudyStats.questionCount}</strong> question(s))
              </span>
            )}
          </div>
          {warningCount > 0 && (
            <div className="mx-5 mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <FiAlertTriangle size={14} className="shrink-0" />
              {warningCount} question(s) have a data warning (click the ⚠ next to their Legacy ID
              below) — they will still be imported as-is unless you cancel.
            </div>
          )}

          <div className="mx-5 max-h-[50vh] overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Legacy ID</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Stem</th>
                  <th className="px-3 py-2">Marks</th>
                  <th className="px-3 py-2">Tags</th>
                  <th className="px-3 py-2 text-center">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pageRows.map((r) => (
                  <tr key={r.index} className={r.warnings.length > 0 ? "bg-amber-50/50" : undefined}>
                    <td className="px-3 py-1.5 text-zinc-400">{r.index + 1}</td>
                    <td className="px-3 py-1.5 text-zinc-500">
                      <div className="flex items-center gap-1.5">
                        {r.raw.LegacyQuestionId ?? "—"}
                        {r.caseStudy && <CaseStudyTrigger caseStudy={r.caseStudy} />}
                        <WarningTrigger warnings={r.warnings} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">
                      {QUESTION_TYPE_LABELS[r.raw.TypeCode as QuestionTypeCode] ?? r.raw.TypeCode}
                    </td>
                    <td className="max-w-md truncate px-3 py-1.5">{toPlainText(r.presentation?.stem ?? "")}</td>
                    <td className="px-3 py-1.5 text-zinc-500">
                      {r.answer?.marks ?? r.raw.Marks ?? "—"} / {r.answer?.negative ?? r.raw.Negative ?? 0}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map((t, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                            title={t.Key}
                          >
                            {t.Value}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <ViewJsonButton r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-3 text-sm text-zinc-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 bg-violet-50/50 px-5 py-4">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? <FiLoader size={14} className="animate-spin" /> : <FiGitMerge size={14} />}
              {importing ? "Importing…" : `Import ${rows.length} question(s)`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
