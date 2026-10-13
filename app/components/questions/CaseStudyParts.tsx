"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Modal } from "rsuite";
import { FiBookOpen, FiEdit2, FiEye, FiFileText, FiLoader, FiSearch } from "react-icons/fi";
import Drawer from "@/app/components/common/Drawer";
import { MathText } from "@/app/components/common/MathText";
import {
  buttonClass,
  iconButtonClass,
  iconTextButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  savedIconTextButtonClass,
} from "@/app/components/common/ui";
import {
  caseStudyLabel,
  looksLikeHtmlText,
  validateCaseStudy,
  type CaseStudyRef,
} from "@/app/lib/questions/caseStudy";
import { loadCaseStudy, saveCaseStudy, searchCaseStudies } from "@/app/lib/questions/actions";
import type { CaseStudyDetail, CaseStudyListItem } from "@/app/lib/questions/data";
import { useDebouncedValue } from "@/app/lib/shared/useDebouncedValue";
import { notify } from "@/app/lib/shared/toast";

// Plain-text paragraphs keep their line breaks; HTML ones must not (the
// markup already says where the breaks are).
function paragraphClass(text: string): string {
  return looksLikeHtmlText(text) ? "text-sm text-zinc-800" : "whitespace-pre-wrap text-sm text-zinc-800";
}

// Read-only view of a case study's paragraph — shown under a case-study
// question so the author sees the context the question is asked against.
export function CaseStudySummary({
  title,
  text,
  code,
  maxHeightClass = "max-h-40",
}: {
  title: string;
  text: string;
  code?: string | null;
  maxHeightClass?: string;
}) {
  return (
    <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50/40 px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <FiBookOpen size={13} className="text-indigo-600" />
        <span className="text-xs font-semibold text-zinc-800">{title.trim() || "Case study"}</span>
        {code && <span className="font-mono text-[10px] text-zinc-400">{code}</span>}
      </div>
      <div className={`${maxHeightClass} overflow-y-auto ${paragraphClass(text)}`}>
        <MathText text={text} inline={false} />
      </div>
    </div>
  );
}

type Tab = "existing" | "new";

// The one place a case study is chosen or written. Opened from a case-study
// question's "Case study" button:
//   mode "pick" — two tabs: "Choose existing" (search the saved paragraphs) and
//                 "Add new" (type/paste text or HTML, or read a Word file);
//   mode "edit" — just the form, prefilled with `current`; saving adds a new
//                 version of that paragraph (every question using it sees it).
// Either way `onSelect` receives the saved case study, so the question can be
// linked to a real groupId straight away.
export function CaseStudyDrawer({
  open,
  mode,
  current,
  onClose,
  onSelect,
}: {
  open: boolean;
  mode: "pick" | "edit";
  current: CaseStudyRef | null;
  onClose: () => void;
  onSelect: (ref: CaseStudyRef) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit case study" : "Case study"}
      subTitle={
        mode === "edit"
          ? "Saving creates a new version; every question using it shows the new text"
          : "Reuse a saved paragraph or add a new one"
      }
      widthClass="max-w-xl"
    >
      {/* Mounted only while open so the form always starts from `current`. */}
      {open && <DrawerBody mode={mode} current={current} onSelect={onSelect} />}
    </Drawer>
  );
}

function DrawerBody({
  mode,
  current,
  onSelect,
}: {
  mode: "pick" | "edit";
  current: CaseStudyRef | null;
  onSelect: (ref: CaseStudyRef) => void;
}) {
  const [tab, setTab] = useState<Tab>("existing");

  if (mode === "edit") {
    return <CaseStudyForm initial={current} editing onSaved={onSelect} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        <button
          type="button"
          className={tab === "existing" ? primaryButtonClass : buttonClass}
          onClick={() => setTab("existing")}
        >
          Choose existing
        </button>
        <button
          type="button"
          className={tab === "new" ? primaryButtonClass : buttonClass}
          onClick={() => setTab("new")}
        >
          Add new
        </button>
      </div>
      {tab === "existing" ? (
        <ExistingList onPick={onSelect} />
      ) : (
        <CaseStudyForm initial={null} editing={false} onSaved={onSelect} />
      )}
    </div>
  );
}

function ExistingList({ onPick }: { onPick: (ref: CaseStudyRef) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pickingId, setPickingId] = useState<string | null>(null);
  // The case study open in the "view full" modal; `detail` is null while it loads.
  const [viewing, setViewing] = useState<{ groupId: string; detail: CaseStudyDetail | null } | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);
  const requestKey = `${debouncedQ}|${page}`;
  const [result, setResult] = useState<{
    key: string;
    items: CaseStudyListItem[];
    total: number;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchCaseStudies(debouncedQ, page).then((res) => {
      if (cancelled) return;
      setResult(
        res.ok
          ? { key: requestKey, items: res.items, total: res.total, error: null }
          : { key: requestKey, items: [], total: 0, error: res.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, page, requestKey]);

  const loading = result?.key !== requestKey;
  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  async function handlePick(groupId: string) {
    setPickingId(groupId);
    try {
      const res = await loadCaseStudy(groupId);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      const cs = res.caseStudy;
      onPick({ groupId: cs.groupId, code: cs.code, title: cs.title, text: cs.text });
    } finally {
      setPickingId(null);
    }
  }

  async function handleView(groupId: string) {
    setViewing({ groupId, detail: null });
    const res = await loadCaseStudy(groupId);
    if (!res.ok) {
      notify(res.error, "error");
      setViewing(null);
      return;
    }
    // Ignore a late response if the modal was closed or switched meanwhile.
    setViewing((cur) => (cur?.groupId === groupId ? { groupId, detail: res.caseStudy } : cur));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <FiSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          className={`${inputClass} pl-8`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by words in the paragraph, title or code…"
          autoComplete="off"
        />
      </div>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {loading && <p className="text-xs text-zinc-500">Loading…</p>}
      {!loading && !result?.error && result?.items.length === 0 && (
        <p className="text-sm text-zinc-500">No case studies found. Use &ldquo;Add new&rdquo; to create one.</p>
      )}

      <div className="flex flex-col gap-2">
        {(result?.items ?? []).map((c) => (
          <div key={c.groupId} className="flex flex-col gap-1.5 rounded-md border border-zinc-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FiBookOpen size={13} className="shrink-0 text-indigo-600" />
                <span className="truncate text-sm font-semibold text-zinc-900">
                  {c.title?.trim() || "Untitled case study"}
                </span>
              </div>
              <span className="shrink-0 text-[11px] text-zinc-500">
                {c.questionCount} question{c.questionCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="line-clamp-3 text-xs text-zinc-600">{c.preview}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-zinc-400">{c.code ?? ""}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={iconButtonClass}
                  onClick={() => handleView(c.groupId)}
                  aria-label={`View full case study ${c.title ?? c.code ?? ""}`}
                  title="View full case study"
                >
                  <FiEye size={14} />
                </button>
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => handlePick(c.groupId)}
                  disabled={pickingId !== null}
                >
                  {pickingId === c.groupId ? "Loading…" : "Use this"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button className={buttonClass} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            className={buttonClass}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}

      <Modal open={viewing !== null} onClose={() => setViewing(null)} size="md">
        <Modal.Header>
          <Modal.Title>{viewing?.detail ? viewing.detail.title || "Case study" : "Case study"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewing?.detail ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                {viewing.detail.code && <span className="font-mono">{viewing.detail.code}</span>}
                <span>version {viewing.detail.versionNo}</span>
                <span>
                  {viewing.detail.questions.length} question{viewing.detail.questions.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className={paragraphClass(viewing.detail.text)}>
                <MathText text={viewing.detail.text} inline={false} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Loading…</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className={buttonClass} onClick={() => setViewing(null)}>
            Close
          </button>
          {viewing?.detail && (
            <button
              className={primaryButtonClass}
              onClick={() => {
                const cs = viewing.detail!;
                setViewing(null);
                onPick({ groupId: cs.groupId, code: cs.code, title: cs.title, text: cs.text });
              }}
            >
              Use this
            </button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
}

// Title + paragraph. The paragraph is a plain textarea: type or paste plain
// text or HTML, write LaTeX as \( ... \), or fill it from a Word file (its
// Equation-tool maths is converted to \( ... \) LaTeX — text and equations
// only, no images/audio/video).
function CaseStudyForm({
  initial,
  editing,
  onSaved,
}: {
  initial: CaseStudyRef | null;
  editing: boolean;
  onSaved: (ref: CaseStudyRef) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const wordInputRef = useRef<HTMLInputElement>(null);

  async function handleWordFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (wordInputRef.current) wordInputRef.current.value = "";
    if (!file) return;

    setError(null);
    setReading(true);
    try {
      // Loaded on demand so jszip/fast-xml-parser only ship to users who use it.
      const { extractWordImportLines } = await import("@/app/lib/questions/wordDocx");
      // Prose: keep the Word file's line breaks and display equations.
      const lines = await extractWordImportLines(file, { keepLineBreaks: true });
      const incoming = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!incoming) {
        setError("No text was found in that Word file.");
        return;
      }
      setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${incoming}` : incoming));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReading(false);
    }
  }

  async function handleSave() {
    const err = validateCaseStudy({ title, text });
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await saveCaseStudy({
        groupId: editing ? (initial?.groupId ?? null) : null,
        code: initial?.code ?? null,
        title,
        text,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      notify(editing && initial?.groupId ? "Case study updated (new version)." : "Case study saved.", "success");
      onSaved({ groupId: res.groupId, code: res.code || initial?.code || null, title: title.trim(), text: text.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={labelClass}>
          Title <span className="text-red-500">*</span>
        </label>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short name you will search and pick it by — e.g. Shop sales — pens"
          autoComplete="off"
        />
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className={`${labelClass} mb-0`}>
            Paragraph <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            className={buttonClass}
            onClick={() => wordInputRef.current?.click()}
            disabled={reading}
            title="Read text and equations from a Word file"
          >
            <span className="inline-flex items-center gap-1.5">
              {reading ? <FiLoader className="animate-spin" size={13} /> : <FiFileText size={13} />}
              {reading ? "Reading…" : "Upload Word (LaTeX)"}
            </span>
          </button>
          <input ref={wordInputRef} type="file" accept=".docx" hidden onChange={handleWordFile} />
        </div>
        <textarea
          className={`${inputClass} h-56 font-mono text-xs`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Type or paste the paragraph — plain text or HTML.\nFor maths write LaTeX as \\( x^2 \\), or upload a Word file."}
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] text-zinc-500">
          Plain text, HTML, or LaTeX in <code>{"\\( … \\)"}</code>. A Word upload converts its equations to LaTeX and
          is added to what is already here.
        </p>
      </div>

      {text.trim() && (
        <div>
          <label className={labelClass}>Preview</label>
          <div className={`max-h-64 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 ${paragraphClass(text)}`}>
            <MathText text={text} inline={false} />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button type="button" className={primaryButtonClass} onClick={handleSave} disabled={saving || reading}>
          {saving ? "Saving…" : editing ? "Save new version" : "Save & use"}
        </button>
      </div>
    </div>
  );
}

// Compact case-study control for a question's header row, next to its
// type/difficulty/status dropdowns (shown only for the "case_study" kind): one
// button that opens the drawer — it carries the attached paragraph's title (or
// the start of its text) so you can see what is attached — plus a small edit
// button once a paragraph is attached. No row of its own.
export function CaseStudyButton({
  caseStudy,
  onPick,
  onEdit,
}: {
  caseStudy: CaseStudyRef | null | undefined;
  onPick: () => void;
  onEdit: () => void;
}) {
  const label = caseStudy ? caseStudyLabel(caseStudy, 28) : "Case study";
  const tooltip = caseStudy
    ? `${caseStudy.code ? `${caseStudy.code} — ` : ""}${caseStudy.text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}${
        caseStudy.groupId ? "" : "\n(from import — saved together with the question)"
      }`
    : "Choose a saved case study or add a new one";

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={`${caseStudy ? savedIconTextButtonClass : iconTextButtonClass} max-w-56`}
        onClick={onPick}
        title={tooltip}
      >
        <FiBookOpen size={14} className="shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {caseStudy && (
        <button type="button" className={iconButtonClass} onClick={onEdit} aria-label="Edit case study paragraph" title="Edit paragraph">
          <FiEdit2 size={13} />
        </button>
      )}
    </div>
  );
}
