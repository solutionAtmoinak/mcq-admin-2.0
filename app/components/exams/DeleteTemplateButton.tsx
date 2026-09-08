"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FiLoader, FiTrash2 } from "react-icons/fi";
import Swal from "sweetalert2";
import { deleteBlueprintTemplate } from "@/app/lib/exams/actions";
import { notify } from "@/app/lib/shared/toast";
import { dangerIconButtonClass } from "@/app/components/common/ui";

export default function DeleteTemplateButton({ templateId, templateName }: { templateId: string; templateName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    const result = await Swal.fire({
      title: `Delete "${templateName}"?`,
      text: "This cannot be undone from here.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    startTransition(async () => {
      const res = await deleteBlueprintTemplate(templateId);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`"${templateName}" deleted.`, "success");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className={dangerIconButtonClass}
      aria-label={`Delete ${templateName}`}
      title="Delete template"
    >
      {isPending ? <FiLoader className="animate-spin" size={13} /> : <FiTrash2 size={13} />}
    </button>
  );
}
