"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import Swal from "sweetalert2";
import { changeMockTestStatus } from "@/app/lib/examActions";
import { MOCK_TEST_STATUS_BADGE } from "@/app/lib/examConstants";
import { toLabelRecord, type ServiceOption } from "@/app/lib/serviceOptions";
import { notify } from "@/app/lib/toast";

// Same click-to-change pattern as QuestionStatusBadge, reused here for
// MockTest — usable both inline in the exams list table and on an exam's
// own detail ("upsert") page.
export default function MockTestStatusBadge({
  mockTestId,
  examName,
  status,
  examStatusOptions,
}: {
  mockTestId: string;
  examName: string;
  status: number;
  examStatusOptions: ServiceOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const statusLabels = useMemo(() => toLabelRecord(examStatusOptions), [examStatusOptions]);

  async function handleClick() {
    const optionsHtml = examStatusOptions
      .map(({ value, displayLabel }) => `<option value="${value}" ${value === status ? "selected" : ""}>${displayLabel}</option>`)
      .join("");

    const result = await Swal.fire<{ toStatus: number }>({
      title: "Change status",
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:12px;font-weight:500;color:#71717a;margin-bottom:4px;">${examName}</label>
          <select id="swal-mocktest-status" class="swal2-select" style="width:100%;margin:4px 0 0;">${optionsHtml}</select>
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
        const select = document.getElementById("swal-mocktest-status") as HTMLSelectElement | null;
        return { toStatus: Number(select?.value) };
      },
    });

    if (!result.isConfirmed || !result.value) return;
    const { toStatus } = result.value;
    if (toStatus === status) return;

    startTransition(async () => {
      const res = await changeMockTestStatus(mockTestId, toStatus);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`${examName} status updated.`, "success");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50 ${
        MOCK_TEST_STATUS_BADGE[status] ?? "bg-zinc-100 text-zinc-700"
      }`}
      title="Click to change status"
    >
      {isPending ? "Updating…" : (statusLabels[status] ?? status)}
    </button>
  );
}
