"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ShapeDesignerFields from "@/app/components/exams/ShapeDesignerFields";
import StartFromTemplateField from "@/app/components/exams/StartFromTemplateField";
import MockTestStatusSelect from "@/app/components/exams/MockTestStatusSelect";
import { AppSelectPicker } from "@/app/components/AppSelectPicker";
import { buttonClass, primaryButtonClass } from "@/app/components/ui";
import { createMockTestFromDraft, updateMockTestFromDraft } from "@/app/lib/examActions";
import { notify } from "@/app/lib/toast";
import { emptyTemplateDraft, filterJsonToTemplateDraft, validateShapeDraft, type TemplateDraft } from "@/app/lib/examSchema";
import type { BlueprintTemplateListItem } from "@/app/lib/examData";
import { MOCK_TEST_STATUS, MOCK_TEST_STATUS_LABELS } from "@/app/lib/examConstants";

// The flexible exam page: design from scratch or copy an existing template
// (StartFromTemplateField handles that), decide the test kind (mock or
// not), name the exam, shape its sections, then create it — or, in edit
// mode, save changes back onto the same draft exam.
export default function ExamDesigner({
  templates,
  testKinds,
  initialTemplateId,
  mode = "create",
  mockTestId,
  initialExamName,
  initialDraft,
  initialStatus,
}: {
  templates: BlueprintTemplateListItem[];
  testKinds: { code: string; name: string }[];
  initialTemplateId?: string | null;
  mode?: "create" | "edit";
  mockTestId?: string;
  initialExamName?: string;
  initialDraft?: TemplateDraft;
  initialStatus?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialTemplate = initialTemplateId ? templates.find((t) => t.templateId === initialTemplateId) : undefined;

  const [examName, setExamName] = useState(initialExamName ?? "");
  const [draft, setDraft] = useState<TemplateDraft>(
    initialDraft ?? (initialTemplate ? filterJsonToTemplateDraft(initialTemplate.filterJson) : emptyTemplateDraft())
  );
  const [createStatus, setCreateStatus] = useState<number>(MOCK_TEST_STATUS.DRAFT);

  const isEdit = mode === "edit";
  const isLocked = isEdit && initialStatus !== undefined && initialStatus !== MOCK_TEST_STATUS.DRAFT;

  function handleSubmit() {
    if (!examName.trim()) {
      notify("Please name the exam.", "error");
      return;
    }
    const err = validateShapeDraft(draft);
    if (err) {
      notify(err, "error");
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateMockTestFromDraft(mockTestId!, examName, draft)
        : await createMockTestFromDraft(examName, draft, undefined, createStatus);

      if (!result.ok) {
        notify(result.error, "error");
        return;
      }
      notify(`Exam ${isEdit ? "updated" : "created"}.`, "success");
      router.push(`/exams/mock-tests/${result.mockTestId}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{isEdit ? "Edit exam" : "Design an exam"}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isEdit
              ? "Adjust the name, test kind, timing, marking or sections of this draft exam."
              : "Start from scratch or copy an existing template, decide what kind of exam this is, shape its sections, then create it."}
          </p>
        </div>
        {!isEdit && (
          <StartFromTemplateField
            draft={draft}
            setDraft={setDraft}
            existingTemplates={templates}
            initialCopyFromTemplateId={initialTemplateId}
          />
        )}
      </div>

      {isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This exam is no longer a draft, so its shape is locked. Change its status back to Draft from the exams list to edit it.
        </div>
      )}

      <ShapeDesignerFields
        draft={draft}
        setDraft={setDraft}
        testKinds={testKinds}
        name={examName}
        onNameChange={setExamName}
        nameLabel="Exam name"
        namePlaceholder='e.g. "JEE Main Exam #1"'
        disabled={isLocked}
        statusSlot={
          isEdit && mockTestId && initialStatus !== undefined ? (
            <MockTestStatusSelect mockTestId={mockTestId} examName={examName || "This exam"} status={initialStatus} />
          ) : (
            <AppSelectPicker
              value={createStatus}
              onChange={(v) => setCreateStatus(v ?? MOCK_TEST_STATUS.DRAFT)}
              cleanable={false}
              block
              data={Object.entries(MOCK_TEST_STATUS_LABELS).map(([v, label]) => ({ label, value: Number(v) }))}
            />
          )
        }
      />

      <div className="flex justify-end gap-3">
        <button className={buttonClass} type="button" onClick={() => router.push("/exams/mock-tests")}>
          Cancel
        </button>
        <button className={primaryButtonClass} type="button" disabled={isPending || isLocked} onClick={handleSubmit}>
          {isPending ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create exam"}
        </button>
      </div>
    </div>
  );
}
