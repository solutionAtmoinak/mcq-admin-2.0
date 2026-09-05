"use client";

import { useMemo, useState } from "react";
import { Modal } from "rsuite";
import { FiCopy, FiX } from "react-icons/fi";
import { buttonClass, iconTextButtonClass } from "@/app/components/common/ui";
import { emptyTemplateDraft, filterJsonToTemplateDraft, type TemplateDraft } from "@/app/lib/exams/schema";
import type { BlueprintTemplateListItem } from "@/app/lib/exams/data";

// "Use existing or create new" for shape: choosing a template here IS "use
// existing" (it prefills every field below from that template's saved
// shape, via a modal picker); "create new" is simply leaving nothing chosen
// and designing sections directly. Rendered as a page-header action button
// (same spot/pattern as the "+ Design Exam" button on the list page)
// instead of its own card, so it doesn't compete for attention with the
// fields that actually matter.
export default function StartFromTemplateField({
  draft,
  setDraft,
  existingTemplates,
  initialCopyFromTemplateId,
}: {
  draft: TemplateDraft;
  setDraft: (updater: TemplateDraft | ((d: TemplateDraft) => TemplateDraft)) => void;
  existingTemplates: BlueprintTemplateListItem[];
  initialCopyFromTemplateId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialCopyFromTemplateId ?? null);
  const [modalOpen, setModalOpen] = useState(false);

  const selectedTemplate = useMemo(
    () => (selectedId ? existingTemplates.find((t) => t.templateId === selectedId) : undefined),
    [selectedId, existingTemplates]
  );

  function handlePick(templateId: string) {
    const source = existingTemplates.find((t) => t.templateId === templateId);
    if (!source) return;
    setSelectedId(templateId);
    setDraft((d) => ({ ...filterJsonToTemplateDraft(source.filterJson), name: d.name }));
    setModalOpen(false);
  }

  function handleClear() {
    setSelectedId(null);
    setDraft((d) => ({ ...emptyTemplateDraft(), name: d.name }));
  }

  return (
    <>
      {selectedTemplate ? (
        <span className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
          <FiCopy size={13} />
          {selectedTemplate.name}
          <button type="button" onClick={handleClear} className="text-indigo-400 hover:text-indigo-700" title="Clear template">
            <FiX size={13} />
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setModalOpen(true)} className={iconTextButtonClass}>
          <FiCopy size={13} /> Choose template
        </button>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="xs">
        <Modal.Header>
          <Modal.Title>Choose a template</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {existingTemplates.length === 0 ? (
            <p className="text-sm text-zinc-400">No templates saved yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {existingTemplates.map((t) => (
                <button
                  key={t.templateId}
                  type="button"
                  onClick={() => handlePick(t.templateId)}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-left text-sm hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <div className="font-medium text-zinc-800">{t.name}</div>
                  {t.filterJson.summary && (
                    <div className="mt-0.5 text-xs text-zinc-400">
                      {t.filterJson.summary.totalQuestions} questions · {t.filterJson.summary.totalMarks} marks ·{" "}
                      {t.filterJson.summary.durationMin} min
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className={buttonClass} onClick={() => setModalOpen(false)}>
            Cancel
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
