"use client";

import QuestionPickerDrawer from "@/app/components/exams/QuestionPickerDrawer";
import SectionQuestionList from "@/app/components/exams/SectionQuestionList";
import { cardClass, iconTextButtonClass, sectionLabelClass, subCardClass } from "@/app/components/common/ui";
import type { QuestionLotOption } from "@/app/lib/questions/data";
import type { MockTestDetail } from "@/app/lib/exams/data";
import type { ReferenceData } from "@/app/lib/questions/schema";
import { toValueRecord, type ServiceOption } from "@/app/lib/db/serviceOptions";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FiPlusCircle } from "react-icons/fi";

// Page-level orchestrator for the exam-designer question-pick screen: a
// card per section (picked-question table + "Pick questions" trigger) and
// one shared QuestionPickerDrawer whose target section swaps as the admin
// opens it from different cards. None of this is a one-time setup step —
// every control here stays live for as long as the exam is a Draft, so
// picks can be added, removed, and reordered any number of times right up
// until it's published (see `locked` below).
export default function QuestionPickWorkspace({
  mockTest,
  referenceData,
  lots,
  examStatusOptions,
}: {
  mockTest: MockTestDetail;
  referenceData: ReferenceData;
  lots: QuestionLotOption[];
  examStatusOptions: ServiceOption[];
}) {
  const router = useRouter();
  const EXAM_STATUS = toValueRecord(examStatusOptions);
  const locked = mockTest.status !== EXAM_STATUS.DRAFT;

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Kept separate from drawerOpen (and never cleared on close) so the
  // drawer's content doesn't flash empty while its own close transition is
  // still playing — see Drawer's "stays mounted while closed" design.
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);

  const pickerSection = useMemo(
    () => mockTest.sections.find((s) => s.sectionId === pickerSectionId) ?? null,
    [mockTest.sections, pickerSectionId]
  );

  return (
    <div className="flex flex-col gap-4">
      {locked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This exam is {mockTest.statusLabel.toLowerCase()}, so its question picks are locked. Change its status back
          to Draft from the exams list to add, remove, or reorder questions.
        </div>
      )}

      <div className={cardClass}>
        <div className={sectionLabelClass}>Sections</div>
        <div className="flex flex-col gap-3">
          {mockTest.sections.map((s) => {
            const isOverCapacity = s.picked > s.pool;
            const isFull = s.picked >= s.pool;
            return (
              <div key={s.sectionId} className={subCardClass}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-zinc-800">{s.name}</span>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {s.mandatory} of {s.pool} mandatory to attempt · {s.questionType} · {s.marks} marks
                      {s.negative > 0 ? ` / -${s.negative} negative` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-sm ${isOverCapacity ? "font-semibold text-red-600" : isFull ? "text-emerald-600" : "text-zinc-600"}`}
                    >
                      {s.picked} / {s.pool} picked
                    </span>
                    <button
                      type="button"
                      className={iconTextButtonClass}
                      disabled={locked || isFull}
                      title={locked ? "Exam is locked" : isFull ? "Section is full" : "Pick questions"}
                      onClick={() => {
                        setPickerSectionId(s.sectionId);
                        setDrawerOpen(true);
                      }}
                    >
                      <FiPlusCircle size={13} /> Pick questions
                    </button>
                  </div>
                </div>

                {isOverCapacity && (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <strong>{s.picked - s.pool}</strong> question{s.picked - s.pool === 1 ? "" : "s"} over this section&rsquo;s pool of {s.pool} — remove the extra pick{s.picked - s.pool === 1 ? "" : "s"} below (select with the checkboxes for a bulk remove) before this exam can be published.
                  </div>
                )}

                <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
                  <SectionQuestionList
                    mockTestId={mockTest.mockTestId}
                    sectionId={s.sectionId}
                    questions={s.questions}
                    locked={locked}
                    difficultyOptions={referenceData.difficultyOptions}
                  />
                </div>
              </div>
            );
          })}
          {mockTest.sections.length === 0 && <p className="text-sm text-zinc-400">This exam has no sections yet.</p>}
        </div>
      </div>

      <QuestionPickerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mockTestId={mockTest.mockTestId}
        sectionId={pickerSection?.sectionId ?? ""}
        sectionName={pickerSection?.name ?? ""}
        poolSize={pickerSection?.pool ?? 0}
        currentPickedCount={pickerSection?.picked ?? 0}
        excludeQuestionIds={pickerSection ? pickerSection.questions.map((q) => q.questionId) : []}
        referenceData={referenceData}
        lots={lots}
        onAdded={() => router.refresh()}
      />
    </div>
  );
}
