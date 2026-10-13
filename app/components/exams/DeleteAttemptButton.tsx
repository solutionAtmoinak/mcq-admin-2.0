"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FiLoader, FiTrash2 } from "react-icons/fi";
import Swal from "sweetalert2";
import { dangerIconButtonClass } from "@/app/components/common/ui";
import { deleteExamAttempt } from "@/app/lib/attempts/actions";
import { notify } from "@/app/lib/shared/toast";

// Deletes one student attempt — the attempt and every answer the student selected
// in it. Asks first, because the student's result for that attempt goes with it.
export default function DeleteAttemptButton({
  attemptId,
  examName,
  studentLabel,
  submitted,
}: {
  attemptId: string;
  examName: string;
  studentLabel: string;
  submitted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    const result = await Swal.fire({
      title: "Delete this attempt?",
      html:
        `<b>${escapeHtml(studentLabel)}</b> on <b>${escapeHtml(examName)}</b>.<br/>` +
        `The attempt and all the answers selected in it will be permanently deleted` +
        (submitted ? `, including the submitted marks` : ``) +
        `. This cannot be undone. The student will be able to start this exam again.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete attempt",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    startTransition(async () => {
      const res = await deleteExamAttempt(attemptId);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`Attempt deleted (${res.answersDeleted} answer${res.answersDeleted === 1 ? "" : "s"} removed).`, "success");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className={dangerIconButtonClass}
      aria-label={`Delete attempt of ${studentLabel} on ${examName}`}
      title="Delete attempt"
    >
      {isPending ? <FiLoader className="animate-spin" size={13} /> : <FiTrash2 size={13} />}
    </button>
  );
}

// Names/emails land in the SweetAlert's html — keep them from being read as markup.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
