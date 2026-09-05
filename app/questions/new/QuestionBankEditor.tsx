"use client";

import { AppSelectPicker } from "@/app/components/AppSelectPicker";
import { BackLink } from "@/app/components/BackLink";
import Drawer from "@/app/components/Drawer";
import OptionMediaModal from "@/app/components/OptionMediaModal";
import QuestionOptionalSettingsModal from "@/app/components/QuestionOptionalSettingsModal";
import { TagPairEditor } from "@/app/components/TagPairEditor";
import {
  buttonClass,
  cardClass,
  dangerIconButtonClass,
  iconButtonClass,
  iconTextButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  savedIconTextButtonClass,
  subSectionLabelClass,
} from "@/app/components/ui";
import {
  createQuestionLot,
  createQuestions,
  getQuestionInputForDuplicate,
  updateQuestion,
} from "@/app/lib/actions";
import { QUESTION_STATUS_BADGE } from "@/app/lib/constants";
import type { TodayQuestionItem } from "@/app/lib/data";
import {
  IMPORT_JSON_EXAMPLE,
  QUESTION_TYPE_LABELS,
  emptyQuestion,
  isOptionBasedType,
  nextClientId,
  parseImportJson,
  validateQuestion,
  type OptionInput,
  type QuestionInput,
  type QuestionTypeCode,
  type ReferenceData,
  type TagPair,
} from "@/app/lib/questionSchema";
import { toLabelRecord, valueByLabel, type ServiceOption } from "@/app/lib/serviceOptions";
import { notify } from "@/app/lib/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import {
  FiCheck,
  FiCopy,
  FiEdit2,
  FiImage,
  FiLoader,
  FiMusic,
  FiPaperclip,
  FiSave,
  FiSettings,
  FiTrash2,
  FiVideo,
} from "react-icons/fi";

const OPTION_MEDIA_ICON = {
  image: FiImage,
  audio: FiMusic,
  video: FiVideo,
  document: FiPaperclip,
  attach: FiPaperclip,
} as const;

type Row = {
  clientId: string;
  data: QuestionInput;
  // Set once this row has been persisted — re-saving then calls updateQuestion
  // (a version edit) instead of createQuestions (which would create a duplicate).
  saved: { questionId: string; code: string } | null;
};

type Defaults = {
  tags: TagPair[];
  difficulty: number;
  status: number;
  marks: number;
  negativeMarks: number;
  estSolveSec: number | null;
};

function makeRow(overrides: Partial<QuestionInput> = {}): Row {
  return { clientId: nextClientId(), data: emptyQuestion(overrides), saved: null };
}

function stemPreview(stem: string): string {
  const trimmed = stem.trim();
  if (!trimmed) return "Untitled question";
  return trimmed.length > 70 ? `${trimmed.slice(0, 70)}…` : trimmed;
}

type ActiveLot = { lotId: string; lotNo: string };

// The active lot is minted once per browser tab (see the effect below) and
// kept in sessionStorage so an accidental re-render — or Next.js's dev-mode
// double effect run — doesn't mint two lots for one sitting, while a real
// page refresh or a new tab starts a fresh one.
const ACTIVE_LOT_STORAGE_KEY = "qbe:activeLot";

export default function QuestionBankEditor({
  referenceData,
  todayQuestions,
}: {
  referenceData: ReferenceData;
  todayQuestions: TodayQuestionItem[];
}) {
  const router = useRouter();

  // React's useId() is coordinated between the server-rendered HTML and the
  // client hydration pass, so it's identical on both — unlike nextClientId()
  // (which is Date.now()-based and would differ between SSR and hydration,
  // causing a hydration mismatch on the `name`/`id` attributes derived from
  // it). Only the very first row needs this; rows added afterwards happen
  // purely client-side, after hydration, so nextClientId() is safe there.
  const initialRowId = useId().replace(/:/g, "");

  // "Approved" is the sensible default for a freshly-typed question (most
  // questions typed here are ready to use right away) — resolved by key
  // from the DB-fetched options rather than a hardcoded status number, with
  // the first available option as a last-resort fallback if that row is
  // ever renamed/deactivated.
  const defaultStatusValue =
    valueByLabel(referenceData.questionStatusOptions, "APPROVED") ??
    referenceData.questionStatusOptions[0]?.value ??
    0;

  const [defaults, setDefaults] = useState<Defaults>(() => ({
    tags: [{ key: "", value: "" }],
    difficulty: 2,
    status: defaultStatusValue,
    marks: 1,
    negativeMarks: 0,
    estSolveSec: null,
  }));
  const [rows, setRows] = useState<Row[]>(() => [
    {
      clientId: `row-${initialRowId}`,
      data: emptyQuestion({ tags: [{ key: "", value: "" }] }, defaultStatusValue),
      saved: null,
    },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const questionStatusOptions: ServiceOption[] =
    referenceData.questionStatusOptions;
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; questionId: string }[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [settingsForClientId, setSettingsForClientId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [focusedClientId, setFocusedClientId] = useState<string | null>(null);
  const [duplicatingTodayId, setDuplicatingTodayId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const [lot, setLot] = useState<ActiveLot | null>(null);
  const lotMintedRef = useRef(false);

  // Mints (or restores) this tab's lot number once on mount. Every question
  // saved afterwards — one row at a time or via "Save All" — is stamped
  // with it server-side, so the whole sitting can be found/reused as a
  // group later (surfaced read-only in Batch Default Settings).
  useEffect(() => {
    if (lotMintedRef.current) return;
    lotMintedRef.current = true;

    async function initLot() {
      const stored = window.sessionStorage.getItem(ACTIVE_LOT_STORAGE_KEY);
      if (stored) {
        try {
          setLot(JSON.parse(stored) as ActiveLot);
          return;
        } catch {
          // Corrupted value — fall through and mint a fresh lot instead.
        }
      }
      const res = await createQuestionLot();
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      const next: ActiveLot = { lotId: res.lotId, lotNo: res.lotNo };
      setLot(next);
      window.sessionStorage.setItem(ACTIVE_LOT_STORAGE_KEY, JSON.stringify(next));
    }

    initLot();
  }, []);

  const typeOptions = referenceData.questionTypes;
  const questionStatusLabels = useMemo(
    () => toLabelRecord(referenceData.questionStatusOptions),
    [referenceData.questionStatusOptions]
  );

  function cloneTags(tags: TagPair[]): TagPair[] {
    return tags.map((t) => ({ ...t }));
  }

  function defaultOverrides(): Partial<QuestionInput> {
    return {
      tags: cloneTags(defaults.tags),
      difficulty: defaults.difficulty,
      status: defaults.status,
      marks: defaults.marks,
      negativeMarks: defaults.negativeMarks,
      estSolveSec: defaults.estSolveSec,
    };
  }

  function updateRow(clientId: string, patch: Partial<QuestionInput>) {
    setRows((prev) =>
      prev.map((r) => (r.clientId === clientId ? { ...r, data: { ...r.data, ...patch } } : r))
    );
  }

  function updateOption(clientId: string, index: number, patch: Partial<OptionInput>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.clientId !== clientId) return r;
        const options = r.data.options.map((o, i) => (i === index ? { ...o, ...patch } : o));
        return { ...r, data: { ...r.data, options } };
      })
    );
  }

  function addOption(clientId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.clientId !== clientId) return r;
        const letters = "ABCDEFGH";
        const nextLetter = letters[r.data.options.length] ?? String(r.data.options.length + 1);
        return { ...r, data: { ...r.data, options: [...r.data.options, { id: nextLetter, text: "" }] } };
      })
    );
  }

  function removeOption(clientId: string, index: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.clientId !== clientId) return r;
        if (r.data.options.length <= 2) return r;
        const removedId = r.data.options[index].id;
        const options = r.data.options.filter((_, i) => i !== index);
        const correctOptionIds = r.data.correctOptionIds.filter((id) => id !== removedId);
        return { ...r, data: { ...r.data, options, correctOptionIds } };
      })
    );
  }

  function toggleCorrect(clientId: string, optionId: string, type: QuestionTypeCode) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.clientId !== clientId) return r;
        if (type === "mcq_single") {
          return { ...r, data: { ...r.data, correctOptionIds: [optionId] } };
        }
        const has = r.data.correctOptionIds.includes(optionId);
        const correctOptionIds = has
          ? r.data.correctOptionIds.filter((id) => id !== optionId)
          : [...r.data.correctOptionIds, optionId];
        return { ...r, data: { ...r.data, correctOptionIds } };
      })
    );
  }

  function updateTag(clientId: string, index: number, patch: Partial<TagPair>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.clientId !== clientId) return r;
        const tags = r.data.tags.map((t, i) => (i === index ? { ...t, ...patch } : t));
        return { ...r, data: { ...r.data, tags } };
      })
    );
  }

  function addTag(clientId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.clientId === clientId
          ? { ...r, data: { ...r.data, tags: [...r.data.tags, { key: "", value: "" }] } }
          : r
      )
    );
  }

  function removeTag(clientId: string, index: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.clientId !== clientId) return r;
        const tags = r.data.tags.filter((_, i) => i !== index);
        return { ...r, data: { ...r.data, tags: tags.length ? tags : [{ key: "", value: "" }] } };
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow(defaultOverrides())]);
  }

  function addRows(n: number) {
    setRows((prev) => [...prev, ...Array.from({ length: n }, () => makeRow(defaultOverrides()))]);
  }

  function removeRow(clientId: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.clientId !== clientId)));
  }

  // Inline validation errors on a row card are transient feedback, not a
  // permanent state — they auto-clear a few seconds after appearing, same as
  // the toast that accompanies them. The `prev[clientId] === message` guard
  // stops a stale timeout from clobbering a newer error set in the meantime.
  const ERROR_AUTO_DISMISS_MS = 5000;

  function setRowError(clientId: string, message: string) {
    setErrors((prev) => ({ ...prev, [clientId]: message }));
    window.setTimeout(() => {
      setErrors((prev) => {
        if (prev[clientId] !== message) return prev;
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
    }, ERROR_AUTO_DISMISS_MS);
  }

  function setRowErrors(map: Record<string, string>) {
    setErrors(map);
    for (const [clientId, message] of Object.entries(map)) {
      window.setTimeout(() => {
        setErrors((prev) => {
          if (prev[clientId] !== message) return prev;
          const next = { ...prev };
          delete next[clientId];
          return next;
        });
      }, ERROR_AUTO_DISMISS_MS);
    }
  }

  // Duplicating a half-filled row just multiplies the problem, so this only
  // proceeds once the source row passes the same validation save does —
  // otherwise it surfaces the error the same way an invalid save would.
  function duplicateRow(clientId: string) {
    const source = rows.find((r) => r.clientId === clientId);
    if (!source) return;
    const err = validateQuestion(
      source.data,
      questionStatusOptions.map((o) => o.value),
    );
    if (err) {
      setRowError(clientId, err);
      notify(err, "error");
      return;
    }
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.clientId === clientId);
      if (idx === -1) return prev;
      const clone: Row = {
        clientId: nextClientId(),
        data: { ...prev[idx].data, code: "", tags: cloneTags(prev[idx].data.tags) },
        saved: null,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  }

  function applyDefaultsToAll() {
    setRows((prev) => prev.map((r) => ({ ...r, data: { ...r.data, ...defaultOverrides() } })));
  }

  function handleParseImport(mode: "append" | "replace") {
    setImportError(null);
    setImportWarnings([]);
    try {
      const { rows: parsedRows, warnings } = parseImportJson(
        importText,
        questionStatusOptions,
      );
      const newRows: Row[] = parsedRows.map((data) => ({ clientId: nextClientId(), data, saved: null }));
      setRows((prev) => (mode === "replace" ? newRows : [...prev, ...newRows]));
      setImportWarnings(warnings);
      if (warnings.length === 0) setImportText("");
    } catch (e) {
      setImportError((e as Error).message);
    }
  }

  const totalMarks = useMemo(
    () => rows.reduce((sum, r) => sum + (Number.isFinite(r.data.marks) ? r.data.marks : 0), 0),
    [rows]
  );
  const savedCount = useMemo(() => rows.filter((r) => r.saved).length, [rows]);

  // Questions saved earlier today that aren't already one of the rows below
  // (those show up under "This session" instead, so they're not duplicated).
  const savedElsewhereToday = useMemo(
    () => todayQuestions.filter((q) => !rows.some((r) => r.saved?.questionId === q.id)),
    [todayQuestions, rows]
  );

  function focusRow(clientId: string) {
    setExplorerOpen(false);
    setFocusedClientId(clientId);
    rowRefs.current[clientId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      setFocusedClientId((cur) => (cur === clientId ? null : cur));
    }, 2000);
  }

  // Pulls a question already saved today (not part of this session's rows)
  // into a new, unsaved row so it can be used as a starting point — the code
  // is cleared so saving it creates a distinct question rather than colliding.
  async function handleDuplicateFromToday(questionId: string, code: string) {
    setDuplicatingTodayId(questionId);
    try {
      const res = await getQuestionInputForDuplicate(questionId);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      const newRow: Row = {
        clientId: nextClientId(),
        data: { ...res.input, code: "" },
        saved: null,
      };
      setRows((prev) => [...prev, newRow]);
      notify(`Duplicated ${code} as a new question below.`, "success");
      window.setTimeout(() => focusRow(newRow.clientId), 50);
    } finally {
      setDuplicatingTodayId(null);
    }
  }

  async function handleSaveRow(clientId: string) {
    const row = rows.find((r) => r.clientId === clientId);
    if (!row) return;
    const err = validateQuestion(
      row.data,
      questionStatusOptions.map((o) => o.value),
    );
    if (err) {
      setRowError(clientId, err);
      notify(err, "error");
      return;
    }
    setErrors((prev) => {
      if (!(clientId in prev)) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });

    setSavingIds((prev) => new Set(prev).add(clientId));
    try {
      if (row.saved) {
        const res = await updateQuestion(row.saved.questionId, row.data);
        if (!res.ok) {
          setRowError(clientId, res.error);
          notify(res.error, "error");
          return;
        }
        notify(`Question ${row.saved.code} updated.`, "success");
      } else {
        const res = await createQuestions([row.data], lot?.lotId ?? null);
        if (!res.ok) {
          setRowError(clientId, res.error);
          notify(res.error, "error");
          return;
        }
        const created = res.created[0];
        setRows((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, saved: created } : r)));
        notify(`Question ${created.code} saved.`, "success");
      }
      // Re-fetches this route's server data (reference data + today's
      // questions) without resetting the in-progress `rows` state below, so
      // the "Saved earlier today" panel reflects the DB right after a save.
      router.refresh();
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  }

  function handleSaveAll() {
    const unsaved = rows.filter((r) => !r.saved);
    if (unsaved.length === 0) {
      notify("All questions are already saved.", "info");
      return;
    }

    const nextErrors: Record<string, string> = {};
    const validStatusValues = questionStatusOptions.map((o) => o.value);
    for (const r of unsaved) {
      const err = validateQuestion(r.data, validStatusValues);
      if (err) nextErrors[r.clientId] = err;
    }
    setRowErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    startTransition(async () => {
      const res = await createQuestions(unsaved.map((r) => r.data), lot?.lotId ?? null);
      if (!res.ok) {
        setSubmitError(res.error);
        notify(res.error, "error");
        return;
      }
      setResult(res.created);
      const savedByClientId = new Map(unsaved.map((r, i) => [r.clientId, res.created[i]]));
      setRows((prev) =>
        prev.map((r) => (savedByClientId.has(r.clientId) ? { ...r, saved: savedByClientId.get(r.clientId)! } : r))
      );
      notify(`Saved ${res.created.length} question(s).`, "success");
      router.refresh();
    });
  }

  const hasBanner = result !== null || submitError !== null;
  const activeSettingsRow = settingsForClientId ? rows.find((r) => r.clientId === settingsForClientId) : undefined;
  const activeSettingsIndex = settingsForClientId ? rows.findIndex((r) => r.clientId === settingsForClientId) : -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header + batch tools, one row */}
      <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
        <div className="">
          <div className="flex items-center gap-3">
            <BackLink href="/questions" label="Back" />
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900 mb-2">Create Questions</h1>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-2xl text-sm text-zinc-500">
              Add several questions in one batch, or paste JSON to import many at once. Each question is
              saved with its first version, tags and search index in a single step.
            </p>
            <div className="flex w-full shrink-0 flex-col gap-2 rounded-lg bg-zinc-950 px-3 py-2 shadow shadow-black sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
              <span className="text-xs font-semibold uppercase tracking-wide text-white sm:mr-1">
                Batch tools
              </span>
              <button className={buttonClass} onClick={() => setDefaultsOpen(true)}>
                Batch Default Settings
              </button>
              <button className={buttonClass} onClick={() => setImportOpen(true)}>
                Import from JSON
              </button>
              <button className={`${buttonClass} xl:hidden`} onClick={() => setExplorerOpen(true)}>
                Today&apos;s Questions ({rows.length + savedElsewhereToday.length})
              </button>
            </div>
          </div>
        </div>
        {referenceData.dimensions.length === 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            No tag keys exist yet — that&apos;s fine. Type a key (e.g. <code>subject</code>) and a value
            (e.g. <code>Reasoning</code>) in the tags field below and both will be created automatically
            when you save.
          </div>
        )}
      </div>

      {hasBanner && (
        <div className="flex shrink-0 flex-col gap-2 px-6 pt-4">
          {result && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Saved {result.length} question(s).</p>
                <button className="text-xs underline" onClick={() => setResult(null)}>
                  Dismiss
                </button>
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {result.map((r) => (
                  <li key={r.questionId}>
                    <Link className="underline" href={`/questions/${r.questionId}`}>
                      {r.code}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {submitError}
            </div>
          )}
        </div>
      )}

      {/* Scrollable rows + fixed today's-questions panel on the right */}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-3">
            {rows.map((row, idx) => (
              <QuestionRowCard
                key={row.clientId}
                cardRef={(el) => {
                  rowRefs.current[row.clientId] = el;
                }}
                index={idx}
                row={row}
                typeOptions={typeOptions}
                difficultyOptions={referenceData.difficultyOptions}
                statusOptions={referenceData.questionStatusOptions}
                error={errors[row.clientId]}
                isSaving={savingIds.has(row.clientId)}
                isFocused={focusedClientId === row.clientId}
                onUpdate={(patch) => updateRow(row.clientId, patch)}
                onUpdateOption={(i, patch) => updateOption(row.clientId, i, patch)}
                onAddOption={() => addOption(row.clientId)}
                onRemoveOption={(i) => removeOption(row.clientId, i)}
                onToggleCorrect={(optionId) => toggleCorrect(row.clientId, optionId, row.data.typeCode)}
                onRemove={() => removeRow(row.clientId)}
                onDuplicate={() => duplicateRow(row.clientId)}
                onSave={() => handleSaveRow(row.clientId)}
                onOpenSettings={() => setSettingsForClientId(row.clientId)}
                canRemove={!!(rows.length > 1)}
              />
            ))}
          </div>
        </div>

        {/* Fixed side explorer — persistent on wide screens; collapses to the
            "Today's Questions" drawer button above on narrower ones. */}
        <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-zinc-200 bg-zinc-50/60 px-3 py-4 xl:flex">
          <h2 className={`${subSectionLabelClass} px-1`}>Today&apos;s Questions</h2>
          <TodayExplorerPanel
            rows={rows}
            savingIds={savingIds}
            errors={errors}
            savedElsewhereToday={savedElsewhereToday}
            onFocusRow={focusRow}
            onDuplicateToday={handleDuplicateFromToday}
            duplicatingTodayId={duplicatingTodayId}
            statusLabels={questionStatusLabels}
          />
        </aside>
      </div>

      {/* Fixed bottom action bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-800 py-3 pl-16 pr-6">
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            onClick={addRow}
          >
            + Add row
          </button>
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            onClick={() => addRows(5)}
          >
            + Add 5 rows
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-400">
            {rows.length} question{rows.length === 1 ? "" : "s"} · {totalMarks} total marks
            {savedCount > 0 ? ` · ${savedCount} saved` : ""}
          </span>
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSaveAll}
            disabled={isPending || rows.length === savedCount}
          >
            {isPending ? "Saving…" : "Save All"}
          </button>
        </div>
      </div>

      {activeSettingsRow && (
        <QuestionOptionalSettingsModal
          open={!!settingsForClientId}
          onClose={() => setSettingsForClientId(null)}
          title={`Optional settings — Question ${activeSettingsIndex + 1}`}
          data={activeSettingsRow.data}
          referenceData={referenceData}
          onUpdate={(patch) => updateRow(activeSettingsRow.clientId, patch)}
          onUpdateTag={(i, patch) => updateTag(activeSettingsRow.clientId, i, patch)}
          onAddTag={() => addTag(activeSettingsRow.clientId)}
          onRemoveTag={(i) => removeTag(activeSettingsRow.clientId, i)}
        />
      )}

      <Drawer
        open={explorerOpen}
        onClose={() => setExplorerOpen(false)}
        title="Today's Questions"
        widthClass="max-w-sm"
      >
        <TodayExplorerPanel
          rows={rows}
          savingIds={savingIds}
          errors={errors}
          savedElsewhereToday={savedElsewhereToday}
          onFocusRow={focusRow}
          onDuplicateToday={handleDuplicateFromToday}
          duplicatingTodayId={duplicatingTodayId}
          statusLabels={questionStatusLabels}
        />
      </Drawer>

      <Drawer
        open={defaultsOpen}
        onClose={() => setDefaultsOpen(false)}
        title="Batch Default Settings"
        widthClass="max-w-md"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>Lot number</label>
            <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
              <span className="flex-1 font-mono text-sm font-semibold text-zinc-800">
                {lot?.lotNo ?? "Generating…"}
              </span>
              {lot && (
                <button
                  type="button"
                  className={iconButtonClass}
                  onClick={() => {
                    navigator.clipboard.writeText(lot.lotNo);
                    notify("Lot number copied.", "success");
                  }}
                  aria-label="Copy lot number"
                  title="Copy lot number"
                >
                  <FiCopy size={13} />
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Every question saved in this session — one at a time or via &ldquo;Save All&rdquo; — is
              tagged with this lot number, so the batch can be found together later.
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            Applied automatically to new rows. Use &ldquo;Apply to all rows&rdquo; to overwrite existing rows
            too.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Difficulty</label>
              <AppSelectPicker
                block
                value={defaults.difficulty}
                onChange={(v) => setDefaults((d) => ({ ...d, difficulty: v ?? d.difficulty }))}
                data={referenceData.difficultyOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <AppSelectPicker
                block
                value={defaults.status}
                onChange={(v) => setDefaults((d) => ({ ...d, status: v ?? d.status }))}
                data={referenceData.questionStatusOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
              />
            </div>
            <div>
              <label className={labelClass}>Marks</label>
              <input
                type="number"
                className={inputClass}
                value={defaults.marks}
                onChange={(e) => setDefaults((d) => ({ ...d, marks: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={labelClass}>Negative</label>
              <input
                type="number"
                className={inputClass}
                value={defaults.negativeMarks}
                onChange={(e) => setDefaults((d) => ({ ...d, negativeMarks: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={labelClass}>Est. seconds</label>
              <input
                type="number"
                className={inputClass}
                value={defaults.estSolveSec ?? ""}
                onChange={(e) =>
                  setDefaults((d) => ({
                    ...d,
                    estSolveSec: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Tags</label>
            <TagPairEditor
              tags={defaults.tags}
              referenceData={referenceData}
              onUpdate={(i, patch) =>
                setDefaults((d) => ({
                  ...d,
                  tags: d.tags.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
                }))
              }
              onAdd={() => setDefaults((d) => ({ ...d, tags: [...d.tags, { key: "", value: "" }] }))}
              onRemove={(i) =>
                setDefaults((d) => {
                  const tags = d.tags.filter((_, idx) => idx !== i);
                  return { ...d, tags: tags.length ? tags : [{ key: "", value: "" }] };
                })
              }
            />
          </div>
          <button className={primaryButtonClass} onClick={applyDefaultsToAll}>
            Apply to all rows
          </button>
        </div>
      </Drawer>

      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk Import from JSON"
        widthClass="max-w-xl"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">
            Paste an array of question objects (e.g. generated by an AI assistant). Each tag is a{" "}
            <code>{"{ key, value }"}</code> pair — any key or value not already in your tag bank is created
            automatically when you save.
          </p>
          <textarea
            className={`${inputClass} h-64 font-mono text-xs`}
            placeholder={IMPORT_JSON_EXAMPLE}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} onClick={() => setImportText(IMPORT_JSON_EXAMPLE)}>
              Load example
            </button>
            <button className={primaryButtonClass} onClick={() => handleParseImport("append")}>
              Parse &amp; append to rows
            </button>
            <button className={buttonClass} onClick={() => handleParseImport("replace")}>
              Parse &amp; replace rows
            </button>
          </div>
          {importError && <p className="text-sm text-red-600">{importError}</p>}
          {importWarnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-amber-700">
              {importWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      </Drawer>
    </div>
  );
}

function TodayExplorerPanel({
  rows,
  savingIds,
  errors,
  savedElsewhereToday,
  onFocusRow,
  onDuplicateToday,
  duplicatingTodayId,
  statusLabels,
}: {
  rows: Row[];
  savingIds: Set<string>;
  errors: Record<string, string>;
  savedElsewhereToday: TodayQuestionItem[];
  onFocusRow: (clientId: string) => void;
  onDuplicateToday: (questionId: string, code: string) => void;
  duplicatingTodayId: string | null;
  statusLabels: Record<number, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className={subSectionLabelClass}>This session ({rows.length})</h3>
        <div className="flex flex-col gap-1.5">
          {rows.map((row, idx) => {
            const isSaving = savingIds.has(row.clientId);
            const hasError = !!errors[row.clientId];
            const state = isSaving ? "Saving…" : row.saved ? "Saved" : hasError ? "Needs fixes" : "Draft";
            const badgeClass = isSaving
              ? "bg-blue-100 text-blue-700"
              : row.saved
                ? "bg-emerald-100 text-emerald-700"
                : hasError
                  ? "bg-red-100 text-red-700"
                  : "bg-zinc-100 text-zinc-600";
            return (
              <button
                key={row.clientId}
                type="button"
                onClick={() => onFocusRow(row.clientId)}
                className="flex flex-col gap-0.5 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-left hover:border-zinc-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-900">
                    Q{idx + 1}
                    {row.saved && <span className="ml-1 font-mono text-[10px] text-zinc-400">{row.saved.code}</span>}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
                    {state}
                  </span>
                </div>
                <span className="truncate text-xs text-zinc-500">{stemPreview(row.data.stem)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {savedElsewhereToday.length > 0 && (
        <div>
          <h3 className={subSectionLabelClass}>Saved earlier today ({savedElsewhereToday.length})</h3>
          <div className="flex flex-col gap-1.5">
            {savedElsewhereToday.map((q) => {
              const isDuplicating = duplicatingTodayId === q.id;
              return (
                <div key={q.id} className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-900">{q.code}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${QUESTION_STATUS_BADGE[q.status] ?? "bg-zinc-100 text-zinc-700"
                        }`}
                    >
                      {statusLabels[q.status] ?? q.status}
                    </span>
                  </div>
                  <span className="truncate text-xs text-zinc-500">{stemPreview(q.stemPreview)}</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Link
                      href={`/questions/${q.id}`}
                      className={iconButtonClass}
                      aria-label={`Edit question ${q.code}`}
                      title="Edit question"
                    >
                      <FiEdit2 size={13} />
                    </Link>
                    <button
                      type="button"
                      className={iconButtonClass}
                      onClick={() => onDuplicateToday(q.id, q.code)}
                      disabled={isDuplicating}
                      aria-label={`Duplicate question ${q.code}`}
                      title="Duplicate as a new question"
                    >
                      {isDuplicating ? <FiLoader className="animate-spin" size={13} /> : <FiCopy size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionRowCard({
  cardRef,
  index,
  row,
  typeOptions,
  difficultyOptions,
  statusOptions,
  error,
  isSaving,
  isFocused,
  onUpdate,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
  onToggleCorrect,
  onRemove,
  onDuplicate,
  onSave,
  onOpenSettings,
  canRemove,
}: {
  cardRef: (el: HTMLElement | null) => void;
  index: number;
  row: Row;
  typeOptions: ReferenceData["questionTypes"];
  difficultyOptions: ServiceOption[];
  statusOptions: ServiceOption[];
  error?: string;
  isSaving: boolean;
  isFocused: boolean;
  onUpdate: (patch: Partial<QuestionInput>) => void;
  onUpdateOption: (index: number, patch: Partial<OptionInput>) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  onToggleCorrect: (optionId: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onSave: () => void;
  onOpenSettings: () => void;
  canRemove: boolean;
}) {
  const { data } = row;
  const optionBased = isOptionBasedType(data.typeCode);
  const saveLabel = row.saved ? `Update question ${index + 1}` : `Save question ${index + 1}`;
  const [mediaOptionIndex, setMediaOptionIndex] = useState<number | null>(null);
  const mediaOption = mediaOptionIndex !== null ? data.options[mediaOptionIndex] : undefined;

  return (
    <section
      ref={cardRef}
      className={`${cardClass} ${error ? "border-red-400" : ""} ${isFocused ? "ring-2 ring-amber-400" : ""
        }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex px-2 py-1 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white shadow shadow-black">
            {index + 1}
          </span>
          {row.saved && (
            <span className="font-mono text-[10px] text-emerald-700" title="Saved question code">
              {row.saved.code}
            </span>
          )}
          <AppSelectPicker
            value={data.typeCode}
            onChange={(typeCode) => {
              if (!typeCode) return;
              onUpdate({
                typeCode,
                correctOptionIds: [],
                correctValue: "",
              });
            }}
            data={typeOptions.map((t) => ({
              label: QUESTION_TYPE_LABELS[t.code] ?? t.name,
              value: t.code,
            }))}
          />
          <AppSelectPicker
            value={data.difficulty}
            onChange={(v) => onUpdate({ difficulty: v ?? data.difficulty })}
            data={difficultyOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
          />
          <AppSelectPicker
            value={data.status}
            onChange={(v) => onUpdate({ status: v ?? data.status })}
            data={statusOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={iconButtonClass}
            onClick={onDuplicate}
            aria-label={`Duplicate question ${index + 1}`}
            title="Duplicate question"
          >
            <FiCopy size={14} />
          </button>
          <button
            type="button"
            className={dangerIconButtonClass}
            onClick={onRemove}
            disabled={!canRemove}
            aria-label={`Remove question ${index + 1}`}
            title="Remove question"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className={labelClass}>Question text</label>
          <textarea
            className={`${inputClass} h-20`}
            value={data.stem}
            onChange={(e) => onUpdate({ stem: e.target.value })}
            placeholder="Enter the question stem…"
            autoComplete="off"
          />
        </div>

        {optionBased ? (
          <div>
            <label className={labelClass}>
              Options ({data.typeCode === "mcq_single" ? "select one correct answer" : "select all correct answers"})
            </label>
            <div className="flex flex-col gap-1.5">
              {data.options.map((opt, i) => {
                const isCorrect = data.correctOptionIds.includes(opt.id);
                const MediaIcon = OPTION_MEDIA_ICON[opt.media?.kind ?? "attach"];
                return (
                  <div
                    key={i}
                    className={`grid grid-cols-[auto_2.75rem_1fr_auto_auto] items-center gap-2 rounded-md px-2 py-1 ${isCorrect ? "bg-emerald-50" : ""
                      }`}
                  >
                    <input
                      type={data.typeCode === "mcq_single" ? "radio" : "checkbox"}
                      name={`correct-${row.clientId}`}
                      checked={isCorrect}
                      onChange={() => onToggleCorrect(opt.id)}
                      title="Mark as correct"
                    />
                    <div
                      className={`flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-mono font-semibold select-none ${isCorrect
                        ? "border-emerald-400 bg-emerald-100 text-emerald-800"
                        : "border-zinc-300 bg-zinc-50 text-zinc-600"
                        }`}
                    >
                      {opt.id}
                    </div>
                    <input
                      className={inputClass}
                      value={opt.text}
                      onChange={(e) => onUpdateOption(i, { text: e.target.value })}
                      placeholder="Option text"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className={opt.media ? savedIconTextButtonClass : buttonClass}
                      onClick={() => setMediaOptionIndex(i)}
                      aria-label={`Attach media to option ${opt.id}`}
                      title={opt.media ? `${opt.media.kind} attached` : "Attach image, audio or video"}
                    >
                      <MediaIcon size={13} />
                    </button>
                    <button
                      className={buttonClass}
                      onClick={() => onRemoveOption(i)}
                      disabled={data.options.length <= 2}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <label className={labelClass}>
              {data.typeCode === "integer" ? "Correct integer answer" : "Correct answer (one word)"}
            </label>
            <input
              className={`${inputClass} w-40`}
              value={data.correctValue}
              onChange={(e) => onUpdate({ correctValue: e.target.value })}
              placeholder={data.typeCode === "integer" ? "e.g. 42" : "e.g. Paris"}
              autoComplete="off"
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Explanation (optional)</label>
          <textarea
            className={`${inputClass} h-16`}
            value={data.explanation}
            onChange={(e) => onUpdate({ explanation: e.target.value })}
            placeholder="Explain the correct answer…"
            autoComplete="off"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {optionBased && (
              <button className={buttonClass} onClick={onAddOption} disabled={data.options.length >= 8}>
                + Add option
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={iconTextButtonClass}
              onClick={onOpenSettings}
              aria-label={`Optional settings for question ${index + 1}`}
              title="Optional settings (marks, tags, code)"
            >
              <FiSettings size={14} />
              Optional
            </button>
            <button
              type="button"
              className={row.saved ? savedIconTextButtonClass : iconTextButtonClass}
              onClick={onSave}
              disabled={isSaving}
              aria-label={saveLabel}
              title={saveLabel}
            >
              {isSaving ? (
                <FiLoader className="animate-spin" size={14} />
              ) : row.saved ? (
                <FiCheck size={14} />
              ) : (
                <FiSave size={14} />
              )}
              {row.saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {mediaOption && (
        <OptionMediaModal
          open={mediaOptionIndex !== null}
          onClose={() => setMediaOptionIndex(null)}
          optionLabel={`Option ${mediaOption.id}`}
          media={mediaOption.media}
          onChange={(media) => onUpdateOption(mediaOptionIndex!, { media })}
        />
      )}
    </section>
  );
}
