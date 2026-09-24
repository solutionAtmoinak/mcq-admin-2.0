"use client";

import { AppSelectPicker } from "@/app/components/common/AppSelectPicker";
import SwitchToggle from "@/app/components/common/SwitchToggle";
import {
  cardClass,
  dangerIconButtonClass,
  iconTextButtonClass,
  inputClass,
  labelClass,
  sectionLabelClass,
  subCardClass,
} from "@/app/components/common/ui";
import ExamBehaviourModal from "@/app/components/exams/ExamBehaviourModal";
import { emptyTemplateSection, totalDurationMin, type TemplateDraft } from "@/app/lib/exams/schema";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { FiPlus, FiSettings, FiTrash2 } from "react-icons/fi";

// Shared "design an exam's shape" fields — test kind, timing/marking, and a
// freely add/remove-able section list. Used by both the exam-creation page
// (design + immediately create a MockTest) and the template-only designer
// (save the shape as a reusable BlueprintTemplate). The "start from a
// template" picker lives in its own component (StartFromTemplateField),
// rendered separately above this one, so it reads as a heading-level choice
// rather than one card among several.
export default function ShapeDesignerFields({
  draft,
  setDraft,
  testKinds,
  name,
  onNameChange,
  nameLabel = "Name",
  namePlaceholder,
  statusSlot,
  disabled = false,
  pickedBySectionId,
  showInstructions = true,
}: {
  draft: TemplateDraft;
  setDraft: (updater: TemplateDraft | ((d: TemplateDraft) => TemplateDraft)) => void;
  testKinds: { code: string; name: string }[];
  name: string;
  onNameChange: (value: string) => void;
  nameLabel?: string;
  namePlaceholder?: string;
  statusSlot?: ReactNode;
  disabled?: boolean;
  // How many questions are already picked per existing section (keyed by
  // sectionId) — only present in edit mode. Shown next to "Questions" so
  // shrinking a section below its current picks is visible immediately,
  // not just discovered later on save or on the question picker page.
  pickedBySectionId?: Record<string, number>;
  // Instructions live only on the materialized MockTest (see
  // TemplateDraft.instructions) — never on a BlueprintTemplate, so the
  // template-only designer (TemplateDesigner.tsx) hides this card entirely
  // rather than showing a field that would silently be discarded on save.
  showInstructions?: boolean;
}) {
  // Remembers each section's last non-zero negative value so switching the
  // toggle off then back on restores it instead of resetting to a default.
  const lastNegativeRef = useRef<Record<string, number>>({});
  const [behaviourOpen, setBehaviourOpen] = useState(false);
  // How many behaviour switches are on — shown on the Settings button so a
  // non-default choice is visible without opening the modal.
  const activeSettingsCount = Number(draft.sequentialSections) + Number(draft.allowResume);

  const testKindOptions = useMemo(
    () => testKinds.map((k) => ({ label: `${k.name} (${k.code})`, value: k.code })),
    [testKinds],
  );

  const totals = useMemo(() => {
    const totalQuestions = draft.sections.reduce((sum, s) => sum + (Number(s.questions) || 0), 0);
    const totalMarks = draft.sections.reduce((sum, s) => sum + (Number(s.questions) || 0) * (Number(s.marks) || 0), 0);
    // Breaks are between sections, so the last section's is never taken.
    const totalBreakMin = draft.sections.slice(0, -1).reduce((sum, s) => sum + (Number(s.breakMin) || 0), 0);
    return {
      totalQuestions,
      totalMarks,
      sectionCount: draft.sections.length,
      durationMin: totalDurationMin(draft.sections),
      totalBreakMin,
    };
  }, [draft.sections]);

  function handleTestKindPick(code: string | null) {
    if (!code) return;
    const kind = testKinds.find((k) => k.code === code);
    setDraft((d) => ({ ...d, testKindCode: code, testKindName: kind?.name ?? d.testKindName }));
  }

  function updateSection(clientId: string, patch: Partial<TemplateDraft["sections"][number]>) {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)),
    }));
  }

  function toggleNegative(clientId: string, current: number) {
    if (current > 0) {
      lastNegativeRef.current[clientId] = current;
      updateSection(clientId, { negative: 0 });
    } else {
      updateSection(clientId, { negative: lastNegativeRef.current[clientId] ?? 1 });
    }
  }

  function addSection() {
    setDraft((d) => ({ ...d, sections: [...d.sections, emptyTemplateSection()] }));
  }

  function removeSection(clientId: string) {
    setDraft((d) => ({ ...d, sections: d.sections.filter((s) => s.clientId !== clientId) }));
  }

  return (
    <>
      <div className={cardClass}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className={statusSlot ? "md:col-span-5" : "md:col-span-7"}>
            <label className={labelClass}>{nameLabel}</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={namePlaceholder}
              disabled={disabled}
            />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Test kind</label>
            <AppSelectPicker
              data={testKindOptions}
              value={draft.testKindCode || null}
              onChange={handleTestKindPick}
              placeholder="Pick a kind"
              searchable
              block
              disabled={disabled}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Total of each section time (min)</label>
            {/* Derived from the sections' own times below — never typed in. */}
            <p
              className="mt-2 font-bold text-slate-900"
              tabIndex={-1}
              title="Sum of every section's time"
            >{totals.durationMin}</p>
          </div>
          {statusSlot && (
            <div className="md:col-span-2">
              <label className={labelClass}>Status</label>
              {statusSlot}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
          {draft.testKindCode && (
            <span>
              Kind: <span className="font-medium text-zinc-700">{draft.testKindName || draft.testKindCode}</span>{" "}
              <span className="font-mono text-zinc-400">({draft.testKindCode})</span>
            </span>
          )}
          <span>
            <span className="font-medium text-zinc-700">{totals.sectionCount}</span> section
            {totals.sectionCount === 1 ? "" : "s"}
          </span>
          <span>
            <span className="font-medium text-zinc-700">{totals.totalQuestions}</span> questions
          </span>
          <span>
            <span className="font-medium text-zinc-700">{totals.totalMarks}</span> marks
          </span>
          <span>
            <span className="font-medium text-zinc-700">{totals.durationMin}</span> min
            {totals.totalBreakMin > 0 && <> + {totals.totalBreakMin} min break</>}
          </span>
          <button
            type="button"
            className={`${iconTextButtonClass} ml-auto`}
            onClick={() => setBehaviourOpen(true)}
            title="Exam behaviour settings"
          >
            <FiSettings size={13} /> Settings
            {activeSettingsCount > 0 && (
              <span className="ml-1 rounded-full bg-zinc-900 px-1.5 text-[10px] font-semibold leading-4 text-white">
                {activeSettingsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <ExamBehaviourModal
        open={behaviourOpen}
        onClose={() => setBehaviourOpen(false)}
        settings={{ sequentialSections: draft.sequentialSections, allowResume: draft.allowResume }}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        disabled={disabled}
      />

      {showInstructions && (
        <div className={cardClass}>
          <div>
            <div className={sectionLabelClass}>Instructions</div>
            <p className="text-xs text-zinc-400">
              Shown to the student before they enter this exam. Leave blank to skip.
            </p>
          </div>
          <textarea
            className={`${inputClass} mt-2 h-28`}
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            placeholder="e.g. This exam has 3 sections. Once started, the timer cannot be paused... etc. (Can uses raw html format)"
            disabled={disabled}
          />
        </div>
      )}

      <div className={cardClass}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className={sectionLabelClass}>Sections</div>
            <p className="text-xs text-zinc-400">
              Each section has its own time limit, a pool of questions and how many of those are mandatory to attempt.
            </p>
          </div>
          <button type="button" className={iconTextButtonClass} onClick={addSection}>
            <FiPlus size={13} /> Add section
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {draft.sections.map((s, idx) => {
            const hasNegative = s.negative > 0;
            const picked = s.sectionId ? (pickedBySectionId?.[s.sectionId] ?? 0) : 0;
            const overCapacity = picked > s.questions;
            return (
              <div key={s.clientId} className={subCardClass}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Section {idx + 1}</span>
                  <button
                    type="button"
                    className={dangerIconButtonClass}
                    onClick={() => removeSection(s.clientId)}
                    title="Remove section"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="w-full sm:w-1/3">
                    <label className={labelClass}>Section name</label>
                    <input
                      className={inputClass}
                      value={s.name}
                      onChange={(e) => updateSection(s.clientId, { name: e.target.value })}
                      placeholder="e.g. Physics"
                    />
                  </div>
                  <div className="flex flex-1 flex-wrap items-end gap-3">
                    <div className="w-24">
                      <label className={labelClass}>Type</label>
                      <input
                        className={inputClass}
                        value={s.questionType}
                        onChange={(e) => updateSection(s.clientId, { questionType: e.target.value })}
                        placeholder="mcq"
                      />
                    </div>
                    <div className={picked > 0 ? "w-36" : "w-24"}>
                      <label className={labelClass}>
                        Questions
                        {picked > 0 && (
                          <span className={`ml-2 mt-1 whitespace-nowrap text-[11px] ${overCapacity ? "font-medium text-red-600" : "text-zinc-400"}`}>
                            {picked} picked{overCapacity ? ` (${picked - s.questions} over)` : ""}
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        className={`${inputClass} ${overCapacity ? "border-red-300 focus:border-red-500" : ""}`}
                        value={s.questions}
                        onChange={(e) => updateSection(s.clientId, { questions: Number(e.target.value) })}
                      />

                    </div>
                    <div className="w-24">
                      <label className={labelClass}>Mandatory</label>
                      <input
                        type="number"
                        className={inputClass}
                        value={s.mandatory}
                        max={s.questions > 0 ? s.questions : 0}
                        onChange={(e) => updateSection(s.clientId, { mandatory: Number(e.target.value) })}
                      />
                    </div>
                    <div className="w-24">
                      <label className={labelClass}>Time (min)</label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        value={s.durationMin}
                        onChange={(e) => updateSection(s.clientId, { durationMin: Number(e.target.value) })}
                        disabled={disabled}
                      />
                    </div>
                    {idx < draft.sections.length - 1 && (
                      <div className="w-28">
                        <label className={labelClass} title="Optional pause given to the student after this section">
                          Break after (min)
                        </label>
                        <input
                          type="number"
                          min={0}
                          className={inputClass}
                          value={s.breakMin}
                          onChange={(e) => updateSection(s.clientId, { breakMin: Number(e.target.value) })}
                          disabled={disabled}
                        />
                      </div>
                    )}
                    <div className="w-20">
                      <label className={labelClass}>Marks</label>
                      <input
                        type="number"
                        className={inputClass}
                        value={s.marks}
                        onChange={(e) => updateSection(s.clientId, { marks: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center gap-2 pb-1.5">
                      <SwitchToggle checked={hasNegative} onChange={() => toggleNegative(s.clientId, s.negative)} />
                      <span className="whitespace-nowrap text-xs font-medium text-zinc-600">Negative</span>
                    </div>
                    {hasNegative && (
                      <div className="w-20">
                        <label className={labelClass}>Neg. marks</label>
                        <input
                          type="number"
                          className={inputClass}
                          value={s.negative}
                          onChange={(e) => updateSection(s.clientId, { negative: Number(e.target.value) })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!draft.sections.length && <p className="text-sm text-zinc-400">No sections yet — add one above.</p>}
        </div>
      </div>
    </>
  );
}
