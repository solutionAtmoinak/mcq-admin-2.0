"use client";

import { useState } from "react";
import { Modal } from "rsuite";
import { FiEye } from "react-icons/fi";
import { MathText, toPlainText } from "@/app/components/common/MathText";
import { buttonClass, iconButtonClass } from "@/app/components/common/ui";

export default function QuestionStemCell({
  questionCode,
  stem,
}: {
  questionCode: string;
  stem: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{toPlainText(stem)}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={iconButtonClass}
          aria-label={`View full question ${questionCode}`}
          title="View full question"
        >
          <FiEye size={13} />
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} size="sm">
        <Modal.Header>
          <Modal.Title>{questionCode}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <MathText text={stem} inline={false} />
        </Modal.Body>
        <Modal.Footer>
          <button className={buttonClass} onClick={() => setOpen(false)}>
            Close
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
