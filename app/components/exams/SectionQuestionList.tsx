"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { FiArrowDown, FiArrowUp, FiX } from "react-icons/fi";
import { removeQuestionsFromSection, reorderSectionQuestions } from "@/app/lib/examActions";
import { notify } from "@/app/lib/toast";
import { dangerIconButtonClass, iconButtonClass } from "@/app/components/ui";
import { DIFFICULTY_LABELS } from "@/app/lib/questionSchema";
import type { PickedQuestionView } from "@/app/lib/examData";

// A section's current picks, in exam order — the "re-arrange any time
// before publish" half of the picker: up/down to reorder (persisted
// immediately via reorderSectionQuestions), a remove button per row, and a
// checkbox-driven bulk remove for clearing several at once. Every mutation
// just calls router.refresh() afterwards rather than updating local state
// optimistically, matching how the rest of the app's inline actions
// (DeleteQuestionButton, StatusChanger, ...) already behave.
export default function SectionQuestionList({
  mockTestId,
  sectionId,
  questions,
  locked,
}: {
  mockTestId: string;
  sectionId: string;
  questions: PickedQuestionView[];
  locked: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const allSelected = questions.length > 0 && questions.every((q) => selected.has(q.questionId));
  const someSelected = questions.some((q) => selected.has(q.questionId));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleOne(questionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(questions.map((q) => q.questionId)));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    startTransition(async () => {
      const res = await reorderSectionQuestions(mockTestId, sectionId, reordered.map((q) => q.questionId));
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      router.refresh();
    });
  }

  async function handleRemoveOne(questionId: string, code: string) {
    const result = await Swal.fire({
      title: `Remove ${code} from this section?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    startTransition(async () => {
      const res = await removeQuestionsFromSection(mockTestId, sectionId, [questionId]);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`Removed ${code}.`, "success");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
      router.refresh();
    });
  }

  async function handleRemoveSelected() {
    const ids = [...selected];
    if (!ids.length) return;

    const result = await Swal.fire({
      title: `Remove ${ids.length} question${ids.length === 1 ? "" : "s"} from this section?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Remove ${ids.length}`,
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    startTransition(async () => {
      const res = await removeQuestionsFromSection(mockTestId, sectionId, ids);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`Removed ${res.removedCount} question${res.removedCount === 1 ? "" : "s"}.`, "success");
      setSelected(new Set());
      router.refresh();
    });
  }

  if (questions.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-zinc-400">No questions picked yet.</p>;
  }

  return (
    <div>
      {!locked && someSelected && (
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
          <span className="text-xs text-zinc-500">{selected.size} selected</span>
          <button
            type="button"
            disabled={isPending}
            onClick={handleRemoveSelected}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiX size={12} /> Remove {selected.size} selected
          </button>
        </div>
      )}
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            {!locked && (
              <th className="w-8 px-3 py-2">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all picked questions in this section"
                />
              </th>
            )}
            <th className="w-8 px-3 py-2">#</th>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Stem</th>
            <th className="px-3 py-2">Difficulty</th>
            <th className="px-3 py-2">Tags</th>
            <th className="px-3 py-2">Marks</th>
            {!locked && <th className="w-24 px-3 py-2 text-right">Order</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {questions.map((q, i) => (
            <tr key={q.questionId} className={`hover:bg-zinc-50 ${selected.has(q.questionId) ? "bg-zinc-50" : ""}`}>
              {!locked && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                    checked={selected.has(q.questionId)}
                    onChange={() => toggleOne(q.questionId)}
                    aria-label={`Select ${q.code}`}
                  />
                </td>
              )}
              <td className="px-3 py-2 font-mono text-xs text-zinc-400">{i + 1}</td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-700">
                <Link href={`/questions/${q.questionId}`} className="underline">
                  {q.code}
                </Link>
              </td>
              <td className="max-w-sm truncate px-3 py-2 text-zinc-700">{q.stemPreview}</td>
              <td className="px-3 py-2 text-zinc-500">{DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}</td>
              <td className="px-3 py-2 text-zinc-500">
                {q.tagNames.slice(0, 2).join(", ")}
                {q.tagNames.length > 2 ? "…" : ""}
              </td>
              <td className="px-3 py-2 text-zinc-500">
                +{q.marks}
                {Number(q.negative) > 0 ? ` / -${q.negative}` : ""}
              </td>
              {!locked && (
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      disabled={isPending || i === 0}
                      onClick={() => handleMove(i, -1)}
                      className={iconButtonClass}
                      title="Move up"
                      aria-label={`Move ${q.code} up`}
                    >
                      <FiArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={isPending || i === questions.length - 1}
                      onClick={() => handleMove(i, 1)}
                      className={iconButtonClass}
                      title="Move down"
                      aria-label={`Move ${q.code} down`}
                    >
                      <FiArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleRemoveOne(q.questionId, q.code)}
                      className={dangerIconButtonClass}
                      title="Remove from section"
                      aria-label={`Remove ${q.code}`}
                    >
                      <FiX size={12} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
