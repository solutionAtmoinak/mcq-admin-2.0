"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FiCopy, FiDownload, FiFileText, FiLoader, FiUploadCloud } from "react-icons/fi";
import { MathText } from "@/app/components/common/MathText";
import SwitchToggle from "@/app/components/common/SwitchToggle";
import {
  buttonClass,
  cardClass,
  iconTextButtonClass,
  inputClass,
  primaryButtonClass,
  sectionLabelClass,
} from "@/app/components/common/ui";
import { notify } from "@/app/lib/shared/toast";

type Result = { fileName: string; lines: string[] };

// Every \( ... \) (inline) and \[ ... \] (display) span in the converted text.
function findEquations(text: string): { kind: "inline" | "display"; latex: string }[] {
  const out: { kind: "inline" | "display"; latex: string }[] = [];
  const re = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) out.push({ kind: "display", latex: m[1].trim() });
    else out.push({ kind: "inline", latex: (m[2] ?? "").trim() });
  }
  return out;
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(`${label} copied.`, "success");
  } catch {
    notify("Could not copy — select the text and copy it manually.", "error");
  }
}

// Local Word -> LaTeX reader. Reuses wordDocx.ts's extractWordImportLines (the
// same extractor the case-study drawer uses), loaded on demand so jszip and the
// XML parser only ship to people who open this page.
export default function WordLatexConverter() {
  const inputRef = useRef<HTMLInputElement>(null);
  // Kept so toggling the option re-converts the same file without re-picking it.
  const fileRef = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // On: line breaks and display equations are kept (prose / case study style).
  // Off: one line per Word paragraph, every equation inline (question-import style).
  const [keepLineBreaks, setKeepLineBreaks] = useState(true);

  async function convert(file: File, keep: boolean) {
    setError(null);
    setBusy(true);
    try {
      const { extractWordImportLines } = await import("@/app/lib/questions/wordDocx");
      const lines = await extractWordImportLines(file, { keepLineBreaks: keep });
      setResult({ fileName: file.name, lines });
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setError("Please choose a Word .docx file (older .doc files are not supported).");
      return;
    }
    fileRef.current = file;
    void convert(file, keepLineBreaks);
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    handleFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function handleToggle(next: boolean) {
    setKeepLineBreaks(next);
    if (fileRef.current) void convert(fileRef.current, next);
  }

  const text = useMemo(
    () => (result ? result.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() : ""),
    [result],
  );
  const equations = useMemo(() => findEquations(text), [text]);

  function handleDownload() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(result?.fileName ?? "document").replace(/\.docx$/i, "")}-latex.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`${cardClass} flex flex-col items-center gap-3 border-dashed py-8 text-center ${dragging ? "border-indigo-400 bg-indigo-50/40" : ""
          }`}
      >
        <FiUploadCloud size={28} className="text-zinc-400" />
        <p className="text-sm text-zinc-600">Drag a Word file here, or</p>
        <button type="button" className={primaryButtonClass} onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Reading…" : "Select Word file (.docx)"}
        </button>
        <input ref={inputRef} type="file" accept=".docx" hidden onChange={handleInput} />
        {result && (
          <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <FiFileText size={13} /> {result.fileName}
          </p>
        )}
        <label className="mt-1 flex items-start gap-3 text-left">
          <SwitchToggle checked={keepLineBreaks} onChange={handleToggle} disabled={busy} />
          <span>
            <span className="block text-sm font-medium text-zinc-700">Keep line breaks and display equations</span>
            <span className="block text-xs text-zinc-400">
              On: new lines and blank lines are kept, and an equation on its own line becomes <code>{"\\[ … \\]"}</code>.
              Off: one line per Word paragraph, every equation as <code>{"\\( … \\)"}</code>.
            </span>
          </span>
        </label>
      </div>

      {busy && (
        <p className="inline-flex items-center gap-2 text-sm text-zinc-500">
          <FiLoader className="animate-spin" size={14} /> Converting…
        </p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {result && !error && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className={cardClass}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className={`${sectionLabelClass} mb-0`}>LaTeX / text</h2>
              <div className="flex gap-2">
                <button type="button" className={iconTextButtonClass} onClick={() => copyText(text, "Text")} disabled={!text}>
                  <FiCopy size={14} /> Copy all
                </button>
                <button type="button" className={iconTextButtonClass} onClick={handleDownload} disabled={!text}>
                  <FiDownload size={14} /> Download .txt
                </button>
              </div>
            </div>
            {text ? (
              <textarea
                className={`${inputClass} h-96 font-mono text-xs`}
                value={text}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
            ) : (
              <p className="text-sm text-zinc-500">No text was found in this file.</p>
            )}
            <p className="mt-1 text-[11px] text-zinc-500">
              {result.lines.length} paragraph(s) · {equations.length} equation(s)
            </p>
          </section>

          <section className={cardClass}>
            <h2 className={sectionLabelClass}>Preview</h2>
            <div
              className={`max-h-96 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 ${keepLineBreaks ? "whitespace-pre-wrap" : ""
                }`}
            >
              {text ? <MathText text={text} inline={false} debounceMs={0} /> : null}
            </div>
          </section>

          {equations.length > 0 && (
            <section className={`${cardClass} xl:col-span-2`}>
              <h2 className={sectionLabelClass}>Equations ({equations.length})</h2>
              <div className="flex flex-col gap-2">
                {equations.map((eq, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-white p-2">
                    <span className="w-6 shrink-0 text-center text-xs text-zinc-400">{i + 1}</span>
                    <code className="min-w-0 flex-1 break-all text-xs text-zinc-700">{eq.latex}</code>
                    <div className="max-w-xs shrink-0 overflow-x-auto text-sm">
                      <MathText text={`\\(${eq.latex}\\)`} debounceMs={0} />
                    </div>
                    <button type="button" className={buttonClass} onClick={() => copyText(eq.latex, `Equation ${i + 1}`)}>
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
