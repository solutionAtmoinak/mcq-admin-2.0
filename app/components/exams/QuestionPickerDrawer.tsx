"use client";

import { AppSelectPicker } from "@/app/components/common/AppSelectPicker";
import Drawer from "@/app/components/common/Drawer";
import { TagFilterPicker } from "@/app/components/questions/TagFilterPicker";
import { buttonClass, inputClass, primaryButtonClass } from "@/app/components/common/ui";
import { PAGE_SIZE_OPTIONS } from "@/app/lib/shared/constants";
import { QUESTION_STATUS_BADGE } from "@/app/lib/questions/constants";
import type { QuestionListItem, QuestionLotOption } from "@/app/lib/questions/data";
import { addQuestionsToSection, searchPickerQuestions, selectAllPickerQuestionIds } from "@/app/lib/exams/actions";
import { QUESTION_TYPE_LABELS, type QuestionTypeCode, type ReferenceData } from "@/app/lib/questions/schema";
import { toLabelRecord } from "@/app/lib/db/serviceOptions";
import { notify } from "@/app/lib/shared/toast";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FiChevronLeft, FiChevronRight, FiLoader, FiSearch } from "react-icons/fi";

const SEARCH_DEBOUNCE_MS = 300;
const pageArrowClass =
  "flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30";

// Filter-and-pick UI for a single exam section's question pool. Rendered
// inside the shared Drawer shell so it reads as the same "slide-over panel"
// language as the rest of the app. Mirrors the question bank list page's own
// filters (type/difficulty/status/tags/search) plus a lot-number filter that
// page doesn't have, and adds bulk selection on top: a page-level checkbox,
// a cross-page "select all matching filters" action, and a capacity guard so
// a section's defined pool size can never be oversold.
export default function QuestionPickerDrawer({
  open,
  onClose,
  mockTestId,
  sectionId,
  sectionName,
  poolSize,
  currentPickedCount,
  excludeQuestionIds,
  referenceData,
  lots,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  mockTestId: string;
  sectionId: string;
  sectionName: string;
  poolSize: number;
  currentPickedCount: number;
  excludeQuestionIds: string[];
  referenceData: ReferenceData;
  lots: QuestionLotOption[];
  onAdded: () => void;
}) {
  const difficultyLabels = useMemo(
    () => toLabelRecord(referenceData.difficultyOptions),
    [referenceData.difficultyOptions]
  );
  const questionStatusLabels = useMemo(
    () => toLabelRecord(referenceData.questionStatusOptions),
    [referenceData.questionStatusOptions]
  );

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [typeId, setTypeId] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [lotId, setLotId] = useState<string | null>(null);
  const [tagKeys, setTagKeys] = useState<string[]>([]);
  const [tagValues, setTagValues] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const [items, setItems] = useState<QuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  // A separate transition (rather than a manually-managed `loading` boolean)
  // so "is a search in flight" comes straight from React 19's async-aware
  // isSearching, with no setState call needed inside the effect that starts
  // the fetch below.
  const [isSearching, startSearchTransition] = useTransition();

  const requestIdRef = useRef(0);
  // Explicitly `number` (not the more usual `ReturnType<typeof setTimeout>`)
  // because this project's merged Node + DOM globals resolve that alias to
  // NodeJS.Timeout even for window.setTimeout's own (numeric) return value.
  const searchTimeoutRef = useRef<number | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const freeSlots = Math.max(0, poolSize - currentPickedCount);

  // A different section means a fresh pick session — filters can reasonably
  // carry over (an admin filtering by "Physics" often wants the same filter
  // for the next section too), but a stale selected-id set could silently
  // add the wrong questions to the wrong section. Adjusted during render
  // (React's documented pattern for "reset state when a prop changes")
  // rather than in an effect, so it takes effect in the same render pass
  // instead of triggering an extra commit.
  const [prevSectionId, setPrevSectionId] = useState(sectionId);
  if (sectionId !== prevSectionId) {
    setPrevSectionId(sectionId);
    setSelected(new Set());
    setPage(1);
  }

  useEffect(() => {
    if (!open) return;
    const myRequestId = ++requestIdRef.current;
    startSearchTransition(async () => {
      try {
        const res = await searchPickerQuestions({
          q: qDebounced || undefined,
          typeId: typeId ?? undefined,
          difficulty: difficulty ?? undefined,
          status: status ?? undefined,
          lotId: lotId ?? undefined,
          tagKeys,
          tagValues,
          excludeIds: excludeQuestionIds,
          page,
          pageSize,
        });
        if (myRequestId !== requestIdRef.current) return;
        setItems(res.items);
        setTotal(res.total);
      } catch {
        if (myRequestId !== requestIdRef.current) return;
        notify("Failed to load questions.", "error");
      }
    });
  }, [open, qDebounced, typeId, difficulty, status, lotId, tagKeys, tagValues, excludeQuestionIds, page, pageSize]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const pageIds = items.map((it) => it.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  function handleSearchChange(value: string) {
    setQ(value);
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      setQDebounced(value);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= freeSlots) return prev;
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
        return next;
      }
      let room = freeSlots - next.size;
      for (const id of pageIds) {
        if (next.has(id) || room <= 0) continue;
        next.add(id);
        room--;
      }
      return next;
    });
  }

  async function handleSelectAllMatching() {
    setSelectingAll(true);
    try {
      const res = await selectAllPickerQuestionIds(
        {
          q: qDebounced || undefined,
          typeId: typeId ?? undefined,
          difficulty: difficulty ?? undefined,
          status: status ?? undefined,
          lotId: lotId ?? undefined,
          tagKeys,
          tagValues,
          excludeIds: excludeQuestionIds,
        },
        freeSlots
      );
      setSelected(new Set(res.ids));
      if (res.ids.length === 0) {
        notify("No questions match these filters.", "info");
      } else if (res.total > res.ids.length) {
        notify(
          `Selected ${res.ids.length} of ${res.total} matching question(s) — limited by this section's remaining capacity (${freeSlots}).`,
          "info"
        );
      } else {
        notify(`Selected all ${res.ids.length} matching question(s).`, "success");
      }
    } catch {
      notify("Failed to select matching questions.", "error");
    } finally {
      setSelectingAll(false);
    }
  }

  function handleAdd() {
    startTransition(async () => {
      const res = await addQuestionsToSection(mockTestId, sectionId, [...selected]);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`Added ${res.addedCount} question${res.addedCount === 1 ? "" : "s"} to ${sectionName}.`, "success");
      setSelected(new Set());
      onAdded();
      onClose();
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Pick questions — ${sectionName}`}
      widthClass="max-w-7xl"
      // Only the results table scrolls — filters stay put so an open
      // dropdown's position never drifts out from under its trigger (see
      // Drawer's own scrollableBody doc comment).
      scrollableBody={false}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" className={buttonClass} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              {selected.size} of {freeSlots} slot{freeSlots === 1 ? "" : "s"} selected
            </span>
            <button type="button" className={primaryButtonClass} onClick={handleAdd} disabled={isPending || selected.size === 0}>
              {isPending ? "Adding…" : `Add ${selected.size} question${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <span>
            Section pool <strong className="text-zinc-900">{poolSize}</strong> · Already picked{" "}
            <strong className="text-zinc-900">{currentPickedCount}</strong> · Remaining{" "}
            <strong className={freeSlots > 0 ? "text-emerald-700" : "text-red-600"}>{freeSlots}</strong>
          </span>
          {freeSlots <= 0 && <span className="font-medium text-amber-700">Section is full — remove a question to add another.</span>}
        </div>

        <div className="shrink-0 rounded-lg border border-zinc-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            <AppSelectPicker
              placeholder="All types"
              cleanable
              block
              value={typeId}
              onChange={(v) => {
                setTypeId(v);
                setPage(1);
              }}
              data={referenceData.questionTypes.map((t) => ({
                label: QUESTION_TYPE_LABELS[t.code as QuestionTypeCode] ?? t.name,
                value: t.id,
              }))}
            />
            <AppSelectPicker
              placeholder="All difficulties"
              cleanable
              block
              value={difficulty}
              onChange={(v) => {
                setDifficulty(v);
                setPage(1);
              }}
              data={referenceData.difficultyOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
            />
            <AppSelectPicker
              placeholder="All statuses"
              cleanable
              block
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              data={referenceData.questionStatusOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
            />
            <AppSelectPicker
              placeholder="All lots"
              cleanable
              searchable
              block
              value={lotId}
              onChange={(v) => {
                setLotId(v);
                setPage(1);
              }}
              data={lots.map((l) => ({ label: `${l.lotNo} (${l.questionCount})`, value: l.lotId }))}
            />
            <TagFilterPicker
              referenceData={referenceData}
              defaultKeys={[]}
              defaultValues={[]}
              onKeysChange={(keys) => {
                setTagKeys(keys);
                setPage(1);
              }}
              onValuesChange={(values) => {
                setTagValues(values);
                setPage(1);
              }}
            />
          </div>
          <div className="relative mt-2.5">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
            <input
              type="text"
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search question or option text…"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-zinc-500">
            <strong className="text-zinc-900">{total}</strong> question{total === 1 ? "" : "s"} match
          </span>
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-zinc-500 hover:text-zinc-900 hover:underline">
                Clear selection ({selected.size})
              </button>
            )}
            <button
              type="button"
              onClick={handleSelectAllMatching}
              disabled={selectingAll || total === 0 || freeSlots <= 0}
              className="font-medium text-zinc-700 hover:text-zinc-900 hover:underline disabled:cursor-not-allowed disabled:text-zinc-300 disabled:no-underline"
            >
              {selectingAll ? "Selecting…" : `Select all ${Math.min(total, freeSlots)} matching`}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200">
          {/* This is the ONE scroll region in the whole drawer (see
              scrollableBody={false} above) — filter controls above it never
              move, so a dropdown opened there can't drift out of position.
              Scroll/overflow lives on this wrapper, not on <tbody> —
              display:table-row-group ignores max-height/overflow in most
              browsers, so a <tbody> can't independently scroll while <thead>
              stays put. Making <thead> sticky within this scrolling wrapper
              is what keeps the column headers visible as rows scroll. */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="w-10 px-4 py-2">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                      checked={allPageSelected}
                      onChange={toggleAllOnPage}
                      disabled={pageIds.length === 0}
                      aria-label="Select all questions on this page"
                    />
                  </th>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Stem</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Difficulty</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Tags</th>
                  <th className="px-4 py-2">Lot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {isSearching ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">
                      <FiLoader className="mx-auto animate-spin" size={18} />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">
                      No questions match these filters.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isSelected = selected.has(item.id);
                    const isDisabled = !isSelected && selected.size >= freeSlots;
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-zinc-50 ${isSelected ? "bg-zinc-50" : ""} ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                          }`}
                        onClick={() => !isDisabled && toggleOne(item.id)}
                      >
                        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 disabled:opacity-40"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => toggleOne(item.id)}
                            aria-label={`Select question ${item.code}`}
                          />
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-zinc-700">{item.code}</td>
                        <td className="max-w-xs truncate px-4 py-2 text-zinc-700">{item.stemPreview}</td>
                        <td className="px-4 py-2 text-zinc-500">{item.typeName}</td>
                        <td className="px-4 py-2 text-zinc-500">{difficultyLabels[item.difficulty] ?? item.difficulty}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${QUESTION_STATUS_BADGE[item.status] ?? "bg-zinc-100 text-zinc-700"
                              }`}
                          >
                            {questionStatusLabels[item.status] ?? item.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-500">
                          {item.tagNames.slice(0, 2).join(", ")}
                          {item.tagNames.length > 2 ? "…" : ""}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-zinc-500">{item.lotNo ?? "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-500">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-zinc-300 bg-white py-1 pl-2 pr-6 text-xs text-zinc-700 focus:border-zinc-500 focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={pageArrowClass}>
                <FiChevronLeft size={13} />
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={pageArrowClass}
              >
                <FiChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
