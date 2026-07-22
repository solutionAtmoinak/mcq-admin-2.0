"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeQuestionStatus } from "@/app/lib/actions";
import { QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from "@/app/lib/constants";
import { inputClass, labelClass, primaryButtonClass, cardClass, sectionLabelClass } from "@/app/components/ui";
import { AppSelectPicker } from "@/app/components/AppSelectPicker";

export default function StatusChanger({
  questionId,
  currentStatus,
}: {
  questionId: string;
  currentStatus: number;
}) {
  const router = useRouter();
  const [toStatus, setToStatus] = useState(() => {
    const other = Object.keys(QUESTION_STATUS_LABELS)
      .map(Number)
      .find((s) => s !== currentStatus);
    return other ?? currentStatus;
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpdate() {
    setError(null);
    startTransition(async () => {
      const res = await changeQuestionStatus(questionId, toStatus, comment);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setComment("");
      router.refresh();
    });
  }

  return (
    <section className={cardClass}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={`${sectionLabelClass} mb-0`}>Status</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            QUESTION_STATUS_BADGE[currentStatus] ?? "bg-zinc-100 text-zinc-700"
          }`}
        >
          {QUESTION_STATUS_LABELS[currentStatus] ?? currentStatus}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <div>
          <label className={labelClass}>Change to</label>
          <AppSelectPicker
            value={toStatus}
            onChange={(v) => setToStatus(v ?? currentStatus)}
            data={Object.entries(QUESTION_STATUS_LABELS)
              .map(([v, label]) => ({ label, value: Number(v) }))
              .filter((o) => o.value !== currentStatus)}
            block
          />
        </div>
        <div>
          <label className={labelClass}>Comment (optional)</label>
          <input
            className={inputClass}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Reason for this change"
          />
        </div>
        <button
          className={`${primaryButtonClass} w-full`}
          onClick={handleUpdate}
          disabled={isPending || toStatus === currentStatus}
        >
          {isPending ? "Updating…" : "Update status"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}
