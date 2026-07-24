"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ShapeDesignerFields from "@/app/components/exams/ShapeDesignerFields";
import StartFromTemplateField from "@/app/components/exams/StartFromTemplateField";
import { buttonClass, primaryButtonClass } from "@/app/components/ui";
import { createBlueprintTemplate } from "@/app/lib/examActions";
import { notify } from "@/app/lib/toast";
import { emptyTemplateDraft, filterJsonToTemplateDraft, validateTemplateDraft, type TemplateDraft } from "@/app/lib/examSchema";
import type { BlueprintTemplateListItem } from "@/app/lib/examData";

export default function TemplateDesigner({
  existingTemplates,
  testKinds,
  initialCopyFromTemplateId,
}: {
  existingTemplates: BlueprintTemplateListItem[];
  testKinds: { code: string; name: string }[];
  initialCopyFromTemplateId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialSource = initialCopyFromTemplateId
    ? existingTemplates.find((t) => t.templateId === initialCopyFromTemplateId)
    : undefined;

  const [draft, setDraft] = useState<TemplateDraft>(
    initialSource ? filterJsonToTemplateDraft(initialSource.filterJson) : emptyTemplateDraft()
  );

  function handleSubmit() {
    const err = validateTemplateDraft(draft);
    if (err) {
      notify(err, "error");
      return;
    }
    startTransition(async () => {
      const result = await createBlueprintTemplate(draft);
      if (!result.ok) {
        notify(result.error, "error");
        return;
      }
      notify("Template saved.", "success");
      router.push("/exams/templates");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Design an exam template</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Start blank or copy an existing template, pick what kind of exam it produces, then shape its sections.
          </p>
        </div>
        <StartFromTemplateField
          draft={draft}
          setDraft={setDraft}
          existingTemplates={existingTemplates}
          initialCopyFromTemplateId={initialCopyFromTemplateId}
        />
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
        <button className={buttonClass} type="button" onClick={() => router.push("/exams/templates")}>
          Cancel
        </button>
        <button className={primaryButtonClass} type="button" disabled={isPending} onClick={handleSubmit}>
          {isPending ? "Saving…" : "Save template"}
        </button>
      </div>
    </div>
  );
}
