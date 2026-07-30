"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import Swal from "sweetalert2";
import { changeQuestionStatus } from "@/app/lib/actions";
import { QUESTION_STATUS_BADGE } from "@/app/lib/constants";
import type { ServiceOption } from "@/app/lib/serviceOptions";
import { toLabelRecord } from "@/app/lib/serviceOptions";
import { notify } from "@/app/lib/toast";

type StatusFormValues = { toStatus: number; comment: string };

export default function QuestionStatusBadge({
  questionId,
  questionCode,
  status,
  statusOptions,
}: {
  questionId: string;
  questionCode: string;
  status: number;
  statusOptions: ServiceOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const statusLabels = useMemo(() => toLabelRecord(statusOptions), [statusOptions]);

  async function handleClick() {
    const optionsHtml = statusOptions
      .map(
        ({ value, displayLabel }) =>
          `<option value="${value}" ${value === status ? "selected" : ""}>${displayLabel}</option>`
      )
      .join("");

    const result = await Swal.fire<StatusFormValues>({
      title: "Change status",
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:12px;font-weight:500;color:#71717a;margin-bottom:4px;">Question ${questionCode}</label>
          <select id="swal-status" class="swal2-select" style="width:100%;margin:4px 0 12px;">${optionsHtml}</select>
          <label style="display:block;font-size:12px;font-weight:500;color:#71717a;margin-bottom:4px;">Comment (optional)</label>
          <input id="swal-comment" class="swal2-input" style="width:100%;margin:0;" placeholder="Reason for this change" />
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      showClass: { popup: "" },
      hideClass: { popup: "" },
      confirmButtonText: "Update status",
      confirmButtonColor: "#18181b",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const select = document.getElementById("swal-status") as HTMLSelectElement | null;
        const comment = document.getElementById("swal-comment") as HTMLInputElement | null;
        return { toStatus: Number(select?.value), comment: comment?.value ?? "" };
      },
    });

    if (!result.isConfirmed || !result.value) return;
    const { toStatus, comment } = result.value;
    if (toStatus === status) return;

    startTransition(async () => {
      const res = await changeQuestionStatus(questionId, toStatus, comment);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`Question ${questionCode} status updated.`, "success");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50 ${
        QUESTION_STATUS_BADGE[status] ?? "bg-zinc-100 text-zinc-700"
      }`}
      title="Click to change status"
    >
      {isPending ? "Updating…" : (statusLabels[status] ?? status)}
    </button>
  );
}
