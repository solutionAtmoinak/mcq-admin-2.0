"use client";

import SwitchToggle from "@/app/components/common/SwitchToggle";
import { sectionLabelClass } from "@/app/components/common/ui";
import type { ExamSettings } from "@/app/lib/exams/schema";

// Exam-wide behaviour switches (see ExamSettings), stacked in a column.
// Edits apply to the draft immediately.
export default function ExamBehaviourFields({
  settings,
  onChange,
  disabled = false,
  resumeLocked = false,
}: {
  settings: ExamSettings;
  onChange: (patch: Partial<ExamSettings>) => void;
  disabled?: boolean;
  // The exam type is itself resumable, so "save & resume" is fixed on and
  // "submit each section to unlock the next" is fixed off.
  resumeLocked?: boolean;
}) {
  return (
    <div>
      <div className={sectionLabelClass}>Exam behaviour</div>
      <div className="flex flex-col gap-4">
        <label className="flex items-start gap-3">
          <SwitchToggle
            checked={settings.sequentialSections && !resumeLocked}
            onChange={(next) => onChange({ sequentialSections: next })}
            disabled={disabled || resumeLocked}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-700">
              Submit each section to unlock the next <b>{resumeLocked && "(locked)"}</b>
            </span>
            <span className="block text-xs text-zinc-400">
              Students go through sections in order and can&apos;t return to a section once submitted.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <SwitchToggle
            checked={settings.allowResume || resumeLocked}
            onChange={(next) => onChange({ allowResume: next })}
            disabled={disabled || resumeLocked}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-700">Allow save &amp; resume later <b>{resumeLocked && "(locked)"}</b> </span>
            <span className="block text-xs text-zinc-400">
              Students can save their answers and pick the exam back up from where they left off.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
