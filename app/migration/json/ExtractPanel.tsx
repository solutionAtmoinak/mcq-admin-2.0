"use client";

import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiDatabase, FiDownload, FiLoader, FiSearch } from "react-icons/fi";
import { notify } from "@/app/lib/shared/toast";
import { inputClass, labelClass } from "@/app/components/common/ui";

type IdsInfo = { sectionId: number; questionIds: number[] };
type ExtractResult = { sectionId: number; rows: unknown[] };
type Progress = { fetched: number; total: number; batchNo: number; batchCount: number };

// Sections at or under this many questions can be fetched in one request
// without a page limit; above it, Mode 1's full per-row JSON build risks a
// SQL timeout, so a page limit becomes mandatory.
const LARGE_SECTION_THRESHOLD = 500;

// Section 1 — pulls questions straight out of the legacy DB and offers the
// result for download. Deliberately independent of MigratePanel: it never
// feeds `rows` there directly, so a downloaded extract can be reviewed/
// edited outside the app before it's ever uploaded and sent to Mode 2.
//
// Two-step flow to avoid SQL timeouts on large sections:
//   1. "Find Questions" calls Mode 3 (/api/migration/extract-ids) — a
//      cheap, join-free id-only lookup — to show how many questions the
//      section has. Over 500, a page limit becomes required before
//      fetching can proceed.
//   2. "Fetch Data" then calls Mode 1 (/api/migration/extract) once per
//      page-limit-sized chunk of those ids, accumulating rows locally
//      until every chunk is in.
export default function ExtractPanel() {
  const [sectionId, setSectionId] = useState("");
  const [pageLimit, setPageLimit] = useState("");
  const [checking, setChecking] = useState(false);
  const [idsInfo, setIdsInfo] = useState<IdsInfo | null>(null);
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  const isLargeSection = (idsInfo?.questionIds.length ?? 0) > LARGE_SECTION_THRESHOLD;
  const limitRaw = pageLimit.trim();
  const limitMissing = isLargeSection && !limitRaw;

  function handleSectionIdChange(value: string) {
    setSectionId(value);
    // A different section invalidates whatever count/results we already have.
    setIdsInfo(null);
    setExtractResult(null);
    setProgress(null);
    setPageLimit("");
  }

  async function handleFindQuestions() {
    const id = Number(sectionId);
    if (!Number.isInteger(id) || id <= 0) {
      notify("Enter a valid positive Section ID.", "error");
      return;
    }

    setChecking(true);
    setIdsInfo(null);
    setExtractResult(null);
    setProgress(null);
    setPageLimit("");
    try {
      const res = await fetch(`/api/migration/extract-ids?sectionId=${id}`);
      const data = await res.json();
      if (!res.ok) {
        notify(data.error ?? "Could not fetch question ids.", "error");
        return;
      }
      const questionIds: number[] = data.questionIds;
      setIdsInfo({ sectionId: id, questionIds });
      if (questionIds.length > LARGE_SECTION_THRESHOLD) {
        notify(
          `Section ${id} has ${questionIds.length} question(s) — over ${LARGE_SECTION_THRESHOLD}. ` +
          `Set a page limit (e.g. 100) so it's fetched in smaller batches instead of all at once.`,
          "warning",
        );
      } else {
        notify(`Section ${id} has ${questionIds.length} question(s).`, "success");
      }
    } catch {
      notify("Request failed — check your connection and try again.", "error");
    } finally {
      setChecking(false);
    }
  }

  async function handleFetchData() {
    if (!idsInfo) return;
    const requestedLimit = limitRaw ? Number(limitRaw) : null;
    if (limitRaw && (!Number.isInteger(requestedLimit) || (requestedLimit as number) <= 0)) {
      notify("Page limit must be a positive integer.", "error");
      return;
    }
    if (limitMissing) {
      notify(`A page limit is required for sections over ${LARGE_SECTION_THRESHOLD} questions.`, "error");
      return;
    }

    const { sectionId: id, questionIds } = idsInfo;
    const total = questionIds.length;
    const limit = requestedLimit ?? total;

    setFetching(true);
    setExtractResult(null);
    setProgress(null);
    try {
      const batchCount = Math.ceil(total / limit);
      const allRows: unknown[] = [];
      for (let i = 0, batchNo = 1; i < questionIds.length; i += limit, batchNo++) {
        const chunk = questionIds.slice(i, i + limit);
        const res = await fetch(
          `/api/migration/extract?sectionId=${id}&questionIds=${chunk.join(",")}`,
        );
        const data = await res.json();
        if (!res.ok) {
          notify(data.error ?? `Batch ${batchNo} of ${batchCount} failed.`, "error");
          return;
        }
        allRows.push(...data.rows);
        setProgress({ fetched: allRows.length, total, batchNo, batchCount });
      }

      setExtractResult({ sectionId: id, rows: allRows });
      notify(`Extracted ${allRows.length} question(s) from Section ${id}.`, "success");
    } catch {
      notify("Fetch request failed — check your connection and try again.", "error");
    } finally {
      setFetching(false);
    }
  }

  function handleDownloadJson() {
    if (!extractResult) return;
    const blob = new Blob([JSON.stringify(extractResult.rows, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `section-${extractResult.sectionId}-migration.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 bg-linear-to-r from-sky-50 to-white px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white shadow-sm">
          1
        </span>
        <FiDatabase className="shrink-0 text-sky-500" size={20} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-sky-950">Extract from the legacy database</h2>
          <p className="text-xs text-sky-700/80">
            Pull questions straight out form old database by legacy Section ID.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-sky-100 px-5 py-4">
        <div>
          <label className={labelClass}>Legacy Section ID</label>
          <input
            type="number"
            min={1}
            value={sectionId}
            onChange={(e) => handleSectionIdChange(e.target.value)}
            placeholder="e.g. 111"
            className={`${inputClass} w-36`}
          />
        </div>

        <button
          type="button"
          onClick={handleFindQuestions}
          disabled={checking || fetching || !sectionId}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? <FiLoader size={14} className="animate-spin" /> : <FiSearch size={14} />}
          {checking ? "Checking…" : "Find Questions"}
        </button>

        {idsInfo && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${isLargeSection
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
              }`}
          >
            {isLargeSection ? <FiAlertTriangle size={14} /> : <FiCheckCircle size={14} />}
            {idsInfo.questionIds.length} question(s) found in Section {idsInfo.sectionId}
          </div>
        )}
      </div>

      {idsInfo && !extractResult && (
        <div className="flex flex-wrap items-end gap-3 border-t border-sky-100 px-5 py-4">
          <div>
            <label className={labelClass}>
              Page limit{isLargeSection && <span className="text-amber-600"> (required)</span>}
            </label>
            <input
              type="number"
              min={1}
              value={pageLimit}
              onChange={(e) => setPageLimit(e.target.value)}
              placeholder="e.g. 100"
              className={`${inputClass} w-32 ${limitMissing ? "border-amber-400" : ""}`}
            />
          </div>

          <button
            type="button"
            onClick={handleFetchData}
            disabled={fetching || limitMissing}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fetching ? <FiLoader size={14} className="animate-spin" /> : <FiDatabase size={14} />}
            {fetching ? "Fetching…" : "Fetch Data"}
          </button>

          {limitMissing && (
            <p className="text-xs text-amber-700">
              This section has over {LARGE_SECTION_THRESHOLD} questions — set a page limit (e.g. 100 - 200).
            </p>
          )}
        </div>
      )}

      {fetching && progress && (
        <div className="border-t border-sky-100 px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-sky-700">
            <span>
              Batch {progress.batchNo} of {progress.batchCount}
            </span>
            <span>
              {progress.fetched} / {progress.total} question(s)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full rounded-full bg-sky-600 transition-all"
              style={{ width: `${Math.round((progress.fetched / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {extractResult && (
        <div className="flex flex-wrap items-center gap-3 border-t border-sky-100 px-5 py-4">
          <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm text-sky-800">
            <FiCheckCircle size={14} />
            {extractResult.rows.length} question(s) extracted from Section {extractResult.sectionId}
            <button
              type="button"
              onClick={handleDownloadJson}
              title="Download as JSON"
              className="ml-1 inline-flex items-center gap-1 rounded border border-sky-300 bg-white px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
            >
              <FiDownload size={12} /> Download
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
