"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FiImage, FiMusic, FiPaperclip, FiVideo } from "react-icons/fi";
import { updateQuestion } from "@/app/lib/actions";
import {
  QUESTION_TYPE_LABELS,
  isOptionBasedType,
  validateQuestion,
  type OptionInput,
  type QuestionInput,
  type ReferenceData,
  type TagPair,
} from "@/app/lib/questionSchema";
import { TagPairEditor } from "@/app/components/TagPairEditor";
import StatusChanger from "@/app/components/StatusChanger";
import { AppSelectPicker } from "@/app/components/AppSelectPicker";
import { MediaAttachmentField } from "@/app/components/MediaAttachmentField";
import OptionMediaModal from "@/app/components/OptionMediaModal";
import {
  inputClass,
  labelClass,
  cardClass,
  buttonClass,
  primaryButtonClass,
  savedIconTextButtonClass,
  sectionLabelClass,
} from "@/app/components/ui";

const OPTION_MEDIA_ICON = {
  image: FiImage,
  audio: FiMusic,
  video: FiVideo,
  document: FiPaperclip,
  attach: FiPaperclip,
} as const;

// The question's whole detail page IS this form: every field arrives
// pre-populated and can be edited in place. Saving creates a new
// QuestionVersion (see updateQuestion) — there's no separate "edit mode"
// or route to navigate to.
export default function QuestionEditForm({
  questionId,
  currentStatus,
  initialInput,
  referenceData,
  lotNo,
}: {
  questionId: string;
  currentStatus: number;
  initialInput: QuestionInput;
  referenceData: ReferenceData;
  lotNo: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<QuestionInput>(initialInput);
  const [changeNote, setChangeNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mediaOptionIndex, setMediaOptionIndex] = useState<number | null>(null);

  function update(patch: Partial<QuestionInput>) {
    setSaved(false);
    setData((d) => ({ ...d, ...patch }));
  }

  function updateOption(index: number, patch: Partial<OptionInput>) {
    setSaved(false);
    setData((d) => ({
      ...d,
      options: d.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));
  }

  function addOption() {
    setSaved(false);
    setData((d) => {
      const letters = "ABCDEFGH";
      const nextLetter = letters[d.options.length] ?? String(d.options.length + 1);
      return { ...d, options: [...d.options, { id: nextLetter, text: "" }] };
    });
  }

  function removeOption(index: number) {
    setSaved(false);
    setData((d) => {
      if (d.options.length <= 2) return d;
      const removedId = d.options[index].id;
      return {
        ...d,
        options: d.options.filter((_, i) => i !== index),
        correctOptionIds: d.correctOptionIds.filter((id) => id !== removedId),
      };
    });
  }

  function toggleCorrect(optionId: string) {
    setSaved(false);
    setData((d) => {
      if (d.typeCode === "mcq_single") return { ...d, correctOptionIds: [optionId] };
      const has = d.correctOptionIds.includes(optionId);
      return {
        ...d,
        correctOptionIds: has
          ? d.correctOptionIds.filter((id) => id !== optionId)
          : [...d.correctOptionIds, optionId],
      };
    });
  }

  function updateTag(index: number, patch: Partial<TagPair>) {
    setSaved(false);
    setData((d) => ({ ...d, tags: d.tags.map((t, i) => (i === index ? { ...t, ...patch } : t)) }));
  }

  function addTag() {
    setSaved(false);
    setData((d) => ({ ...d, tags: [...d.tags, { key: "", value: "" }] }));
  }

  function removeTag(index: number) {
    setSaved(false);
    setData((d) => {
      const tags = d.tags.filter((_, i) => i !== index);
      return { ...d, tags: tags.length ? tags : [{ key: "", value: "" }] };
    });
  }

  function handleReset() {
    setData(initialInput);
    setChangeNote("");
    setError(null);
    setSaved(false);
  }

  function handleSubmit() {
    const err = validateQuestion(
      data,
      referenceData.questionStatusOptions.map((o) => o.value),
    );
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateQuestion(questionId, data, changeNote);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setChangeNote("");
      setSaved(true);
      router.refresh();
    });
  }

  const optionBased = isOptionBasedType(data.typeCode);
  const isDirty = JSON.stringify(data) !== JSON.stringify(initialInput);
  const mediaOption = mediaOptionIndex !== null ? data.options[mediaOptionIndex] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {saved && !isDirty && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Changes saved.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {/* Main content */}
        <section className={`${cardClass} lg:col-span-2 xl:col-span-3`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className={`${sectionLabelClass} mb-0`}>Question Content</h2>
            <div className="flex flex-wrap gap-2">
              <AppSelectPicker
                value={data.typeCode}
                onChange={(typeCode) => {
                  if (!typeCode) return;
                  update({ typeCode, correctOptionIds: [], correctValue: "" });
                }}
                data={referenceData.questionTypes.map((t) => ({
                  label: QUESTION_TYPE_LABELS[t.code] ?? t.name,
                  value: t.code,
                }))}
              />
              <AppSelectPicker
                value={data.difficulty}
                onChange={(v) => update({ difficulty: v ?? data.difficulty })}
                data={referenceData.difficultyOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Question text</label>
            <textarea
              className={`${inputClass} h-32`}
              value={data.stem}
              onChange={(e) => update({ stem: e.target.value })}
            />
          </div>

          {optionBased ? (
            <div className="mb-4">
              <label className={labelClass}>
                Options ({data.typeCode === "mcq_single" ? "select one correct answer" : "select all correct answers"})
              </label>
              <div className="flex flex-col gap-2">
                {data.options.map((opt, i) => {
                  const isCorrect = data.correctOptionIds.includes(opt.id);
                  const MediaIcon = OPTION_MEDIA_ICON[opt.media?.kind ?? "attach"];
                  return (
                    <div
                      key={i}
                      className={`grid grid-cols-[auto_2.75rem_1fr_auto_auto] items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                        isCorrect ? "bg-emerald-50" : ""
                      }`}
                    >
                      <input
                        type={data.typeCode === "mcq_single" ? "radio" : "checkbox"}
                        name="edit-correct"
                        checked={isCorrect}
                        onChange={() => toggleCorrect(opt.id)}
                        title="Mark as correct"
                      />
                      <div
                        className={`flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-mono font-semibold select-none ${
                          isCorrect
                            ? "border-emerald-400 bg-emerald-100 text-emerald-800"
                            : "border-zinc-300 bg-zinc-50 text-zinc-600"
                        }`}
                      >
                        {opt.id}
                      </div>
                      <input
                        className={inputClass}
                        value={opt.text}
                        onChange={(e) => updateOption(i, { text: e.target.value })}
                        placeholder="Option text"
                      />
                      <button
                        type="button"
                        className={opt.media ? savedIconTextButtonClass : buttonClass}
                        onClick={() => setMediaOptionIndex(i)}
                        aria-label={`Attach media to option ${opt.id}`}
                        title={opt.media ? `${opt.media.kind} attached` : "Attach image, audio or video"}
                      >
                        <MediaIcon size={13} />
                      </button>
                      <button
                        className={buttonClass}
                        onClick={() => removeOption(i)}
                        disabled={data.options.length <= 2}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <button className={`${buttonClass} mt-2`} onClick={addOption} disabled={data.options.length >= 8}>
                + Add option
              </button>
            </div>
          ) : (
            <div className="mb-4">
              <label className={labelClass}>
                {data.typeCode === "integer" ? "Correct integer answer" : "Correct answer (one word)"}
              </label>
              <input
                className={`${inputClass} w-40`}
                value={data.correctValue}
                onChange={(e) => update({ correctValue: e.target.value })}
                placeholder={data.typeCode === "integer" ? "e.g. 42" : "e.g. Paris"}
                autoComplete="off"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Explanation (optional)</label>
            <textarea
              className={`${inputClass} h-20`}
              value={data.explanation}
              onChange={(e) => update({ explanation: e.target.value })}
            />
          </div>
        </section>

        {/* Sidebar */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <StatusChanger
            questionId={questionId}
            currentStatus={currentStatus}
            statusOptions={referenceData.questionStatusOptions}
          />

          <section className={cardClass}>
            <h2 className={sectionLabelClass}>Scoring &amp; timing</h2>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Marks</label>
                <input
                  type="number"
                  className={inputClass}
                  value={data.marks}
                  onChange={(e) => update({ marks: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass}>Negative</label>
                <input
                  type="number"
                  className={inputClass}
                  value={data.negativeMarks}
                  onChange={(e) => update({ negativeMarks: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass}>Seconds</label>
                <input
                  type="number"
                  className={inputClass}
                  value={data.estSolveSec ?? ""}
                  onChange={(e) => update({ estSolveSec: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className={sectionLabelClass}>Media</h2>
            <MediaAttachmentField media={data.media} onChange={(media) => update({ media })} />
          </section>

          <section className={cardClass}>
            <h2 className={sectionLabelClass}>Tags</h2>
            <TagPairEditor
              tags={data.tags}
              referenceData={referenceData}
              onUpdate={updateTag}
              onAdd={addTag}
              onRemove={removeTag}
            />
          </section>

          <section className={cardClass}>
            <h2 className={sectionLabelClass}>Details</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className={labelClass}>Code</label>
                <input className={`${inputClass} opacity-60`} value={data.code} disabled title="Code cannot be changed" />
              </div>
              <div>
                <label className={labelClass}>Lot number</label>
                <input
                  className={`${inputClass} font-mono opacity-60`}
                  value={lotNo ?? "—"}
                  disabled
                  title="The batch this question was created in"
                />
              </div>
              <div>
                <label className={labelClass}>Change note (optional)</label>
                <input
                  className={inputClass}
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="Why is this being edited?"
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <button className={primaryButtonClass} onClick={handleSubmit} disabled={isPending || !isDirty}>
          {isPending ? "Saving…" : "Save Changes"}
        </button>
        <button className={buttonClass} onClick={handleReset} disabled={isPending || !isDirty}>
          Reset
        </button>
        {isDirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
      </div>

      {mediaOption && (
        <OptionMediaModal
          open={mediaOptionIndex !== null}
          onClose={() => setMediaOptionIndex(null)}
          optionLabel={`Option ${mediaOption.id}`}
          media={mediaOption.media}
          onChange={(media) => updateOption(mediaOptionIndex!, { media })}
        />
      )}
    </div>
  );
}
