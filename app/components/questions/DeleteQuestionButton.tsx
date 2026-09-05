"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FiLoader, FiTrash2 } from "react-icons/fi";
import Swal from "sweetalert2";
import { deleteQuestion } from "@/app/lib/questions/actions";
import { notify } from "@/app/lib/shared/toast";
import { dangerIconButtonClass } from "@/app/components/common/ui";

export default function DeleteQuestionButton({
  questionId,
  questionCode,
}: {
  questionId: string;
  questionCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    const result = await Swal.fire({
      title: `Delete question ${questionCode}?`,
      text: "This cannot be undone from here.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    startTransition(async () => {
      const res = await deleteQuestion(questionId);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`Question ${questionCode} deleted.`, "success");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className={dangerIconButtonClass}
      aria-label={`Delete question ${questionCode}`}
      title="Delete question"
    >
      {isPending ? <FiLoader className="animate-spin" size={13} /> : <FiTrash2 size={13} />}
    </button>
  );
}
