"use client";

import { Modal } from "rsuite";
import SwitchToggle from "@/app/components/common/SwitchToggle";
import { buttonClass } from "@/app/components/common/ui";
import type { ExamSettings } from "@/app/lib/exams/schema";

// Exam-wide behaviour switches (see ExamSettings). Edits apply to the draft
// immediately — there's no separate save step, "Done" just closes the modal.
export default function ExamBehaviourModal({
  open,
  onClose,
  settings,
  onChange,
  disabled = false,
}: {
  open: boolean;
  onClose: () => void;
  settings: ExamSettings;
  onChange: (patch: Partial<ExamSettings>) => void;
  disabled?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} size="xs">
      <Modal.Header>
        <Modal.Title>Exam behaviour</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-3">
            <SwitchToggle
              checked={settings.sequentialSections}
              onChange={(next) => onChange({ sequentialSections: next })}
              disabled={disabled}
            />
            <span>
              <span className="block text-sm font-medium text-zinc-700">Submit each section to unlock the next</span>
              <span className="block text-xs text-zinc-400">
                Students go through sections in order and can&apos;t return to a section once submitted.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <SwitchToggle
              checked={settings.allowResume}
              onChange={(next) => onChange({ allowResume: next })}
              disabled={disabled}
            />
            <span>
              <span className="block text-sm font-medium text-zinc-700">Allow save &amp; resume later</span>
              <span className="block text-xs text-zinc-400">
                Students can save their answers and pick the exam back up from where they left off.
              </span>
            </span>
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className={buttonClass} onClick={onClose}>
          Done
        </button>
      </Modal.Footer>
    </Modal>
  );
}
