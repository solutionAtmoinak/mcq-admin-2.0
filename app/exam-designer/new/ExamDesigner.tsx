"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
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
  pickedBySectionId,
}: {
  templates: BlueprintTemplateListItem[];
  testKinds: { code: string; name: string }[];
  initialTemplateId?: string | null;
  mode?: "create" | "edit";
  mockTestId?: string;
  initialExamName?: string;
  initialDraft?: TemplateDraft;
  initialStatus?: number;
  // How many questions are already picked per existing section — only
  // meaningful in edit mode, used to warn before saving a section down to a
  // pool smaller than what's already picked (see handleSubmit below).
  pickedBySectionId?: Record<string, number>;
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

  // Sections whose new "Questions" (pool) size is smaller than how many are
  // already picked for them — only existing sections (sectionId set) can
  // have picks at all, since a brand-new section can't have any yet.
  function findOverCapacitySections() {
    if (!pickedBySectionId) return [];
    return draft.sections
      .filter((s) => s.sectionId)
      .map((s) => ({ section: s, picked: pickedBySectionId[s.sectionId!] ?? 0 }))
      .filter(({ section, picked }) => picked > section.questions);
  }

  // Asks how to resolve sections where the new pool is smaller than what's
  // already picked: auto-trim the excess from the end of each section's
  // order, or save as-is and leave it for the admin to fix on the question
  // picker page (that mismatch then also blocks publishing — see
  // changeMockTestStatus). Returns null if the admin cancels the save
  // entirely, "trim"/"manual" for the two resolutions, or "manual" (a
  // no-op default) when there's nothing to resolve.
  async function resolveOverCapacity(): Promise<"trim" | "manual" | null> {
    const conflicts = findOverCapacitySections();
    if (!conflicts.length) return "manual";

    const listHtml = conflicts
      .map(
        ({ section, picked }) =>
          `<li style="margin-bottom:4px;"><strong>${section.name}</strong>: ${picked} picked, new size ${section.questions} <span style="color:#b91c1c;">(${picked - section.questions} over)</span></li>`
      )
      .join("");

    const result = await Swal.fire({
      title: "Reduce question count?",
      html: `
        <div style="text-align:left;font-size:14px;">
          <p style="margin-bottom:8px;">These section(s) already have more questions picked than the new size allows:</p>
          <ul style="margin:0 0 10px 18px;padding:0;">${listHtml}</ul>
          <p>How should this be resolved?</p>
        </div>
      `,
      icon: "warning",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Auto-remove extra (from last)",
      denyButtonText: "Keep them, I'll remove manually",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#18181b",
      denyButtonColor: "#71717a",
      cancelButtonColor: "#ff0000",
      reverseButtons: true,
    });

    if (result.isConfirmed) return "trim";
    if (result.isDenied) return "manual";
    return null;
  }

  // Not itself part of the pending/saving state — resolveOverCapacity waits
  // on the admin's answer to a dialog, which could sit open for a while and
  // shouldn't make the Save button read "Saving…" before anything's
  // actually being saved.
  async function handleSubmit() {
    if (!examName.trim()) {
      notify("Please name the exam.", "error");
      return;
    }
    const err = validateShapeDraft(draft);
    if (err) {
      notify(err, "error");
      return;
    }

    let overCapacityResolution: "trim" | "manual" = "manual";
    if (isEdit) {
      const resolution = await resolveOverCapacity();
      if (!resolution) return; // admin cancelled the save
      overCapacityResolution = resolution;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateMockTestFromDraft(mockTestId!, examName, draft, undefined, overCapacityResolution)
        : await createMockTestFromDraft(examName, draft, undefined, createStatus);

      if (!result.ok) {
        notify(result.error, "error");
        return;
      }
      notify(`Exam ${isEdit ? "updated" : "created"}.`, "success");
      router.push("/exam-designer");
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
        pickedBySectionId={pickedBySectionId}
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
        <button className={buttonClass} type="button" onClick={() => router.push("/exam-designer")}>
          Cancel
        </button>
        <button className={primaryButtonClass} type="button" disabled={isPending || isLocked} onClick={handleSubmit}>
          {isPending ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create exam"}
        </button>
      </div>
    </div>
  );
}
