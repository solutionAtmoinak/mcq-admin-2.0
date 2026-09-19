"use client";

import { AppSelectPicker } from "@/app/components/common/AppSelectPicker";
import { BackLink } from "@/app/components/common/BackLink";
import Drawer from "@/app/components/common/Drawer";
import { MathTextPreview } from "@/app/components/common/MathText";
import { MediaAttachmentField } from "@/app/components/media/MediaAttachmentField";
import OptionMediaModal from "@/app/components/questions/OptionMediaModal";
import QuestionOptionalSettingsModal from "@/app/components/questions/QuestionOptionalSettingsModal";
import { TagPairEditor } from "@/app/components/questions/TagPairEditor";
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
  subCardClass,
  subSectionLabelClass,
} from "@/app/components/common/ui";
import {
  createQuestionLot,
  createQuestions,
  getQuestionInputForDuplicate,
  updateQuestion,
} from "@/app/lib/questions/actions";
import { QUESTION_STATUS_BADGE } from "@/app/lib/questions/constants";
import type { TodayQuestionItem } from "@/app/lib/questions/data";
import {
  IMPORT_EXCEL_EXAMPLE_ROWS,
  IMPORT_JSON_EXAMPLE,
  QUESTION_TYPE_LABELS,
  emptyQuestion,
  isOptionBasedType,
  nextClientId,
  parseImportExcelRows,
  parseImportJson,
  parseImportWordLines,
  validateQuestion,
  type OptionInput,
  type QuestionInput,
  type QuestionTypeCode,
  type ReferenceData,
  type TagPair,
} from "@/app/lib/questions/schema";
import { toLabelRecord, valueByLabel, type ServiceOption } from "@/app/lib/db/serviceOptions";
import { notify } from "@/app/lib/shared/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type ComponentType,
  type ReactNode,
} from "react";
import * as XLSX from "xlsx";
import {
  FiCheck,
  FiCopy,
  FiCpu,
  FiEdit2,
  FiFileText,
  FiImage,
  FiLoader,
  FiMusic,
  FiPaperclip,
  FiSave,
  FiSettings,
  FiTable,
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

// True for a row nobody has typed anything into yet (the blank starter row
// the page always opens with, or one left untouched after "+ Add row").
function isRowContentEmpty(data: QuestionInput): boolean {
  return (
    data.stem.trim() === "" &&
    data.options.every((o) => !o.text.trim()) &&
    data.explanation.trim() === "" &&
    data.correctValue.trim() === ""
  );
}

// A bulk import (Excel/Word/JSON) always keeps whatever's already on the
// page — unless the page is still just the untouched blank starter row, in
// which case the imported questions take its place instead of stacking
// after a pointless empty row. Never drops rows the import itself found
// nothing to add.
function mergeImportedRows(prev: Row[], imported: Row[]): Row[] {
  if (imported.length === 0) return prev;
  if (prev.length === 1 && !prev[0].saved && isRowContentEmpty(prev[0].data)) {
    return imported;
  }
  return [...prev, ...imported];
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
  const excelInputRef = useRef<HTMLInputElement>(null);
  const wordInputRef = useRef<HTMLInputElement>(null);
  const [isParsingWord, setIsParsingWord] = useState(false);
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
    notify(`Applied defaults to ${rows.length} question${rows.length === 1 ? "" : "s"}.`, "success");
    setDefaultsOpen(false);
  }

  // Closes the drawer and confirms via toast once an import comes through
  // clean (no warnings, at least one question added). A partial import
  // (some rows skipped) leaves the drawer open instead, so the warnings
  // list below stays visible for review.
  function finishBulkImport(newRowCount: number, warnings: string[], sourceLabel: string) {
    setImportWarnings(warnings);
    if (warnings.length === 0 && newRowCount > 0) {
      notify(`Added ${newRowCount} question${newRowCount === 1 ? "" : "s"} from ${sourceLabel}.`, "success");
      setImportOpen(false);
    }
  }

  function handleParseImport() {
    setImportError(null);
    setImportWarnings([]);
    try {
      const { rows: parsedRows, warnings } = parseImportJson(
        importText,
        questionStatusOptions,
      );
      const newRows: Row[] = parsedRows.map((data) => ({ clientId: nextClientId(), data, saved: null }));
      setRows((prev) => mergeImportedRows(prev, newRows));
      if (warnings.length === 0) setImportText("");
      finishBulkImport(newRows.length, warnings, "the AI assistant");
    } catch (e) {
      setImportError((e as Error).message);
    }
  }

  function triggerExcelUpload() {
    excelInputRef.current?.click();
  }

  // Adds to what's already on the page (see mergeImportedRows) — a bulk
  // upload should never silently discard rows already there, unless the
  // page is still just the untouched blank starter row.
  async function handleExcelFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (excelInputRef.current) excelInputRef.current.value = "";
    if (!file) return;

    setImportError(null);
    setImportWarnings([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("The workbook has no sheets.");
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const [headerRow, ...dataRows] = rows;

      const { rows: parsedRows, warnings } = parseImportExcelRows(
        headerRow ?? [],
        dataRows,
        questionStatusOptions,
      );
      const newRows: Row[] = parsedRows.map((data) => ({ clientId: nextClientId(), data, saved: null }));
      setRows((prev) => mergeImportedRows(prev, newRows));
      finishBulkImport(newRows.length, warnings, "your spreadsheet");
    } catch (err) {
      setImportError((err as Error).message);
    }
  }

  function triggerWordUpload() {
    wordInputRef.current?.click();
  }

  // Same merge behavior as the Excel path — see mergeImportedRows. Parsing
  // (unzip + OMML->LaTeX conversion) is dynamically imported so its
  // dependencies (jszip, fast-xml-parser) never load for users who don't
  // use Word import.
  async function handleWordFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (wordInputRef.current) wordInputRef.current.value = "";
    if (!file) return;

    setImportError(null);
    setImportWarnings([]);
    setIsParsingWord(true);
    try {
      const { extractWordImportLines } = await import("@/app/lib/questions/wordDocx");
      const lines = await extractWordImportLines(file);
      const { rows: parsedRows, warnings } = parseImportWordLines(lines, questionStatusOptions);
      const newRows: Row[] = parsedRows.map((data) => ({ clientId: nextClientId(), data, saved: null }));
      setRows((prev) => mergeImportedRows(prev, newRows));
      finishBulkImport(newRows.length, warnings, "your Word document");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setIsParsingWord(false);
    }
  }

  function handleDownloadExcelTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet(IMPORT_EXCEL_EXAMPLE_ROWS);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
    XLSX.writeFile(workbook, "question-import-template.xlsx");
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
    if (Object.keys(nextErrors).length > 0) return;

    startTransition(async () => {
      const res = await createQuestions(unsaved.map((r) => r.data), lot?.lotId ?? null);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      const savedByClientId = new Map(unsaved.map((r, i) => [r.clientId, res.created[i]]));
      setRows((prev) =>
        prev.map((r) => (savedByClientId.has(r.clientId) ? { ...r, saved: savedByClientId.get(r.clientId)! } : r))
      );
      notify(`Saved ${res.created.length} question(s).`, "success");
      router.refresh();
    });
  }

  const activeSettingsRow = settingsForClientId ? rows.find((r) => r.clientId === settingsForClientId) : undefined;
  const activeSettingsIndex = settingsForClientId ? rows.findIndex((r) => r.clientId === settingsForClientId) : -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header + batch tools, one row */}
      <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackLink href="/questions" label="Back" />
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900 mb-2">Create Questions</h1>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 rounded-lg bg-zinc-950 px-3 py-2 shadow shadow-black sm:flex-row sm:flex-wrap sm:items-center lg:w-fit">
            <span className="text-xs font-semibold uppercase tracking-wide text-white sm:mr-1">
              Batch tools
            </span>
            <button className={buttonClass} onClick={() => setDefaultsOpen(true)}>
              Batch Default Settings
            </button>
            <button className={buttonClass} onClick={() => setImportOpen(true)}>
              Bulk Import
            </button>
            <button className={`${buttonClass} xl:hidden`} onClick={() => setExplorerOpen(true)}>
              Today&apos;s Questions ({rows.length + savedElsewhereToday.length})
            </button>
          </div>
          {/* <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-2xl text-sm text-zinc-500">
              Add several questions in one batch, or paste JSON to import many at once. Each question is
              saved with its first version, tags and search index in a single step.
            </p>
            
          </div> */}
        </div>
        {referenceData.dimensions.length === 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            No tag keys exist yet — that&apos;s fine. Type a key (e.g. <code>subject</code>) and a value
            (e.g. <code>Reasoning</code>) in the tags field below and both will be created automatically
            when you save.
          </div>
        )}
      </div>

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
        title="Bulk Import"
        subTitle='Max 100 Questions at a time'
        widthClass="max-w-xl"
      >
        <div className="flex flex-col gap-5">
          <div className={`flex flex-col gap-3 rounded-lg border ${IMPORT_SECTION_COLOR.emerald.bar} bg-white p-3`}>
            <ImportSectionHeader
              icon={FiTable}
              color="emerald"
              title="From a Spreadsheet"
              description="Best for a large batch of plain-text questions — fill in a spreadsheet, then upload it."
            />
            <ul className="flex flex-col gap-1.5 pl-1">
              <ImportStep label="Column 1">Question — type the full question here.</ImportStep>
              <ImportStep label="Column 2+">
                One column per answer choice, named <em>Option A</em>, <em>Option B</em>… (or{" "}
                <em>Option 1</em>, <em>Option 2</em>…) — use 2 to 10 columns.
              </ImportStep>
              <ImportStep label="Correct">
                The letter or number of the right answer (like <em>B</em>). If more than one
                answer is correct, separate them with commas (like <em>B, D</em>).
              </ImportStep>
              <ImportStep label="Explanation">Optional — shown to students after they answer.</ImportStep>
              <ImportStep label="Tag Key / Tag Value">
                Optional — label a question by subject, chapter or topic so it&apos;s easy to find
                later. For more than one label, separate each with a comma in both columns.
              </ImportStep>
              <ImportStep label="Difficulty / Status">Optional — leave blank to use the defaults.</ImportStep>
            </ul>
            <p className="text-xs text-zinc-500">
              Download the sample file to see this laid out. Your questions will be added to the
              list below — anything you&apos;ve already started stays put.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} onClick={handleDownloadExcelTemplate}>
                Download Sample Spreadsheet
              </button>
              <button className={primaryButtonClass} onClick={triggerExcelUpload}>
                Upload Spreadsheet
              </button>
            </div>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={handleExcelFile}
            />
          </div>

          <div className={`flex flex-col gap-3 rounded-lg border ${IMPORT_SECTION_COLOR.blue.bar} bg-white p-3`}>
            <ImportSectionHeader
              icon={FiFileText}
              color="blue"
              title="From a Word Document"
              description="The best way to include math — write your equations with Word's own Equation tool and they'll display correctly here automatically."
            />
            <ul className="flex flex-col gap-1.5 pl-1">
              <ImportStep label="Question:">Start each question with this word, then type it right after.</ImportStep>
              <ImportStep label="Option:">
                Start each answer choice on its own line the same way — at least 2 per question.
              </ImportStep>
              <ImportStep label="Correct:">
                Which answer choice is correct, by its position — for example{" "}
                <em>Correct: 2</em> for the second option, or <em>Correct: 2, 3</em> if more than
                one is correct.
              </ImportStep>
              <ImportStep label="Explanation:">Optional — shown to students after they answer.</ImportStep>
            </ul>
            <p className="text-xs text-zinc-500">
              If a question or answer runs onto a second line in your document, that&apos;s fine —
              it&apos;s still read as one piece of text. Download the sample file to see a working
              example. Your questions will be added to the list below — anything you&apos;ve
              already started stays put.
            </p>
            <div className="flex flex-wrap gap-2">
              <a className={buttonClass} href="/samples/question-import-template.docx" download>
                Download Sample Word File
              </a>
              <button className={primaryButtonClass} onClick={triggerWordUpload} disabled={isParsingWord}>
                {isParsingWord ? "Reading your file…" : "Upload Word File"}
              </button>
            </div>
            <input
              ref={wordInputRef}
              type="file"
              accept=".docx"
              hidden
              onChange={handleWordFile}
            />
          </div>

          <div className={`flex flex-col gap-3 rounded-lg border ${IMPORT_SECTION_COLOR.violet.bar} bg-white p-3`}>
            <ImportSectionHeader
              icon={FiCpu}
              color="violet"
              title="From an AI Assistant"
              description="Used ChatGPT, Claude or another AI tool to write your questions? Have it follow the example format below, then paste its answer here."
            />
            <ul className="flex flex-col gap-1.5 pl-1">
              <ImportStep label="1">
                Click &ldquo;Show Example Format&rdquo; below and share it with your AI tool, asking
                it to write your questions the same way.
              </ImportStep>
              <ImportStep label="2">Paste what it gives you into the box below.</ImportStep>
            </ul>
            <p className="text-xs text-zinc-500">
              Any subject/chapter/topic labels you use are created automatically the first time.
            </p>
            <textarea
              className={`${inputClass} h-64 font-mono text-xs`}
              placeholder={IMPORT_JSON_EXAMPLE}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} onClick={() => setImportText(IMPORT_JSON_EXAMPLE)}>
                Show Example Format
              </button>
              <button className={primaryButtonClass} onClick={handleParseImport}>
                Add These Questions
              </button>
            </div>
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

const IMPORT_SECTION_COLOR = {
  emerald: { badge: "bg-emerald-100 text-emerald-700", bar: "border-emerald-200" },
  blue: { badge: "bg-blue-100 text-blue-700", bar: "border-blue-200" },
  violet: { badge: "bg-violet-100 text-violet-700", bar: "border-violet-200" },
} as const;

// Section header for one bulk-import method in the drawer below — an icon,
// a plain-language title, and a one-line summary of who it's for/why.
function ImportSectionHeader({
  icon: Icon,
  color,
  title,
  description,
}: {
  icon: ComponentType<{ size?: number }>;
  color: keyof typeof IMPORT_SECTION_COLOR;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${IMPORT_SECTION_COLOR[color].badge}`}
      >
        <Icon size={16} />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

// One step in a bulk-import method's instructions — a short labeled chip
// (the exact word/heading to type, or a step number) plus a plain-language
// explanation, in place of a dense wall of text.
function ImportStep({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs text-zinc-600">
      <span className="mt-0.5 shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-700">
        {label}
      </span>
      <span>{children}</span>
    </li>
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
        <fieldset className={`${subCardClass} min-w-0`}>
          <legend className={subSectionLabelClass}>Question</legend>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              {/* <label className={labelClass}>Question text</label> */}
              <textarea
                className={`${inputClass} h-22`}
                value={data.stem}
                onChange={(e) => onUpdate({ stem: e.target.value })}
                placeholder="Enter the question stem…"
                autoComplete="off"
              />
              <MathTextPreview text={data.stem} />
            </div>
            <div className="min-w-0 sm:w-60 sm:shrink-0">
              <label className={labelClass}>Media (optional)</label>
              <MediaAttachmentField media={data.media} onChange={(media) => onUpdate({ media })} />
            </div>
          </div>
        </fieldset>

        <fieldset className={`${subCardClass} min-w-0`}>
          <legend className={subSectionLabelClass}>{optionBased ? "Options" : "Answer"}</legend>
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
                      <MathTextPreview
                        text={opt.text}
                        boxClassName="col-span-5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-800"
                      />
                    </div>
                  );
                })}
              </div>
              <button className={`${buttonClass} mt-2`} onClick={onAddOption} disabled={data.options.length >= 8}>
                + Add option
              </button>
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
        </fieldset>

        <fieldset className={`${subCardClass} min-w-0`}>
          <legend className={subSectionLabelClass}>Explanation (optional)</legend>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              {/* <label className={labelClass}>Explanation (optional)</label> */}
              <textarea
                className={`${inputClass} h-16`}
                value={data.explanation}
                onChange={(e) => onUpdate({ explanation: e.target.value })}
                placeholder="Explain the correct answer…"
                autoComplete="off"
              />
              <MathTextPreview text={data.explanation} />
            </div>
            <div className="min-w-0 sm:w-60 sm:shrink-0">
              {/* <label className={labelClass}>Explanation media (optional)</label> */}
              <MediaAttachmentField
                media={data.explanationMedia}
                onChange={(explanationMedia) => onUpdate({ explanationMedia })}
              />
            </div>
          </div>
        </fieldset>

        <div className="flex items-center justify-end gap-2 pt-1">
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
