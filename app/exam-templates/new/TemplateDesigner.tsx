"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ShapeDesignerFields from "@/app/components/exams/ShapeDesignerFields";
import { buttonClass, primaryButtonClass } from "@/app/components/ui";
import { createBlueprintTemplate, updateBlueprintTemplate } from "@/app/lib/examActions";
import { notify } from "@/app/lib/toast";
import { emptyTemplateDraft, validateTemplateDraft, type TemplateDraft } from "@/app/lib/examSchema";

// Templates are always designed from scratch — no "copy an existing
// template" here (that flexibility lives on the exam-creation page instead,
// via StartFromTemplateField; templates themselves are the thing being
// copied from, not something built by copying another one).
export default function TemplateDesigner({
  testKinds,
  mode = "create",
  templateId,
  initialDraft,
}: {
  testKinds: { code: string; name: string }[];
  mode?: "create" | "edit";
  templateId?: string;
  initialDraft?: TemplateDraft;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState<TemplateDraft>(initialDraft ?? emptyTemplateDraft());
  const isEdit = mode === "edit";

  function handleSubmit() {
    const err = validateTemplateDraft(draft);
    if (err) {
      notify(err, "error");
      return;
    }
    startTransition(async () => {
      const result = isEdit ? await updateBlueprintTemplate(templateId!, draft) : await createBlueprintTemplate(draft);
      if (!result.ok) {
        notify(result.error, "error");
        return;
      }
      notify(`Template ${isEdit ? "updated" : "saved"}.`, "success");
      router.push("/exam-templates");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">{isEdit ? "Edit exam template" : "Design an exam template"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isEdit ? "Adjust its name, test kind, timing, marking or sections." : "Name it, pick what kind of exam it produces, then shape its sections."}
        </p>
      </div>

      <ShapeDesignerFields
        draft={draft}
        setDraft={setDraft}
        testKinds={testKinds}
        name={draft.name}
        onNameChange={(value) => setDraft({ ...draft, name: value })}
        nameLabel="Template name"
        namePlaceholder='e.g. "neet-ug-temp-2026"'
      />

      <div className="flex justify-end gap-3">
        <button className={buttonClass} type="button" onClick={() => router.push("/exam-templates")}>
          Cancel
        </button>
        <button className={primaryButtonClass} type="button" disabled={isPending} onClick={handleSubmit}>
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Save template"}
        </button>
      </div>
    </div>
  );
}
