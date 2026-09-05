"use client";

import { Modal } from "rsuite";
import { MediaAttachmentField } from "@/app/components/MediaAttachmentField";
import { TagPairEditor } from "@/app/components/TagPairEditor";
import { inputClass, labelClass, subCardClassLight, subSectionLabelClass } from "@/app/components/ui";
import type { QuestionInput, ReferenceData, TagPair } from "@/app/lib/questionSchema";

// Reusable rsuite modal for the fields that aren't required to save a
// question: scoring/timing, tags and code. Keeping these out of the main row
// card is what lets that card stay compact.
export default function QuestionOptionalSettingsModal({
  open,
  onClose,
  title,
  data,
  referenceData,
  onUpdate,
  onUpdateTag,
  onAddTag,
  onRemoveTag,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  data: QuestionInput;
  referenceData: ReferenceData;
  onUpdate: (patch: Partial<QuestionInput>) => void;
  onUpdateTag: (index: number, patch: Partial<TagPair>) => void;
  onAddTag: () => void;
  onRemoveTag: (index: number) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <div className={subCardClassLight}>
            <h3 className={subSectionLabelClass}>Scoring &amp; timing</h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Marks</label>
                <input
                  type="number"
                  className={inputClass}
                  value={data.marks}
                  onChange={(e) => onUpdate({ marks: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass}>Negative</label>
                <input
                  type="number"
                  className={inputClass}
                  value={data.negativeMarks}
                  onChange={(e) => onUpdate({ negativeMarks: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass}>Seconds</label>
                <input
                  type="number"
                  className={inputClass}
                  value={data.estSolveSec ?? ""}
                  onChange={(e) => onUpdate({ estSolveSec: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
          </div>

          <div className={subCardClassLight}>
            <h3 className={subSectionLabelClass}>Media</h3>
            <MediaAttachmentField media={data.media} onChange={(media) => onUpdate({ media })} />
          </div>

          <div className={subCardClassLight}>
            <h3 className={subSectionLabelClass}>Tags</h3>
            <TagPairEditor
              tags={data.tags}
              referenceData={referenceData}
              onUpdate={onUpdateTag}
              onAdd={onAddTag}
              onRemove={onRemoveTag}
            />
          </div>

          <div className={subCardClassLight}>
            <h3 className={subSectionLabelClass}>Details</h3>
            <label className={labelClass}>Code (optional)</label>
            <input
              className={inputClass}
              value={data.code}
              onChange={(e) => onUpdate({ code: e.target.value })}
              placeholder="Auto-generated"
            />
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
