"use client";

import { Modal } from "rsuite";
import type { TestKindOption } from "@/app/lib/exams/data";

// Every test kind's name + description, opened from the "i" button next to
// the Test kind picker (ShapeDesignerFields — the exam-designer create/edit
// page and the exam-templates page both render that one component, so this
// modal is wired up once and covers all four pages). Purely informational —
// picking a kind still happens in the dropdown behind this modal.
export default function TestKindInfoModal({
  open,
  onClose,
  testKinds,
  selectedCode,
}: {
  open: boolean;
  onClose: () => void;
  testKinds: TestKindOption[];
  // Highlighted so the admin can spot which kind the draft is currently on.
  selectedCode?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} size="md">
      <Modal.Header>
        <Modal.Title>Test kinds</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {testKinds.length === 0 ? (
          <p className="text-sm text-zinc-400">No test kinds found.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {testKinds.map((k) => {
              const active = k.code === selectedCode;
              return (
                <li
                  key={k.code}
                  className={`rounded-lg border p-3 transition-colors ${
                    active ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{k.name}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-500">
                      {k.code}
                    </span>
                    {active && (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-white">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className={`mt-1.5 text-sm ${k.description ? "text-zinc-600" : "text-zinc-400 italic"}`}>
                    {k.description || "No description yet."}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Modal.Body>
    </Modal>
  );
}
