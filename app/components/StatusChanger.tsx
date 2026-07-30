"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { changeQuestionStatus } from "@/app/lib/actions";
import { QUESTION_STATUS_BADGE } from "@/app/lib/constants";
import type { ServiceOption } from "@/app/lib/serviceOptions";
import { toLabelRecord } from "@/app/lib/serviceOptions";
import { inputClass, labelClass, primaryButtonClass, cardClass, sectionLabelClass } from "@/app/components/ui";
import { AppSelectPicker } from "@/app/components/AppSelectPicker";

export default function StatusChanger({
  questionId,
  currentStatus,
  statusOptions,
}: {
  questionId: string;
  currentStatus: number;
  statusOptions: ServiceOption[];
}) {
  const router = useRouter();
  const statusLabels = useMemo(() => toLabelRecord(statusOptions), [statusOptions]);
  const [toStatus, setToStatus] = useState(() => {
    const other = statusOptions.map((o) => o.value).find((s) => s !== currentStatus);
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
          {statusLabels[currentStatus] ?? currentStatus}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <div>
          <label className={labelClass}>Change to</label>
          <AppSelectPicker
            value={toStatus}
            onChange={(v) => setToStatus(v ?? currentStatus)}
            data={statusOptions
              .filter((o) => o.value !== currentStatus)
              .map((o) => ({ value: o.value, label: o.displayLabel }))}
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
