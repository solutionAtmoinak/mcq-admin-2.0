"use client";

import { useState } from "react";
import { FiCheckCircle, FiDatabase, FiDownload, FiLoader } from "react-icons/fi";
import { notify } from "@/app/lib/shared/toast";
import { inputClass, labelClass } from "@/app/components/common/ui";

type ExtractResult = { sectionId: number; rows: unknown[] };

// Section 1 — pulls questions straight out of the legacy DB (Mode 1 of
// spMcqMigrationService) by MCQSectionId and offers the result for download.
// Deliberately independent of MigratePanel: it never feeds `rows` there
// directly, so a downloaded extract can be reviewed/edited outside the app
// before it's ever uploaded and sent to Mode 2.
export default function ExtractPanel() {
  const [sectionId, setSectionId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  async function handleExtract() {
    const id = Number(sectionId);
    if (!Number.isInteger(id) || id <= 0) {
      notify("Enter a valid positive Section ID.", "error");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch(`/api/migration/extract?sectionId=${id}`);
      const data = await res.json();
      if (!res.ok) {
        notify(data.error ?? "Extraction failed.", "error");
        setExtractResult(null);
        return;
      }
      setExtractResult({ sectionId: id, rows: data.rows });
      notify(`Extracted ${data.rows.length} question(s) from Section ${id}.`, "success");
    } catch {
      notify("Extraction request failed — check your connection and try again.", "error");
    } finally {
      setExtracting(false);
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
            onChange={(e) => setSectionId(e.target.value)}
            placeholder="e.g. 111"
            className={`${inputClass} w-36`}
          />
        </div>
        <button
          type="button"
          onClick={handleExtract}
          disabled={extracting || !sectionId}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {extracting ? <FiLoader size={14} className="animate-spin" /> : <FiDatabase size={14} />}
          {extracting ? "Extracting…" : "Extract"}
        </button>

        {extractResult && (
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
        )}
      </div>
    </section>
  );
}
