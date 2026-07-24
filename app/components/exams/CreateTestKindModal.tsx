"use client";

import { useState } from "react";
import { Modal } from "rsuite";
import { buttonClass, inputClass, labelClass, primaryButtonClass } from "@/app/components/ui";

// "Create new" half of the test-kind picker's "use existing or create new"
// pattern — the code is auto-slugged from the name so the admin only ever
// has to think of one thing to type.
export default function CreateTestKindModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (kind: { code: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!codeTouched) {
      setCode(
        value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
      );
    }
  }

  function handleCreate() {
    if (!name.trim() || !code.trim()) return;
    onCreate({ code: code.trim(), name: name.trim() });
    setName("");
    setCode("");
    setCodeTouched(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="xs">
      <Modal.Header>
        <Modal.Title>New test kind</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelClass}>Name</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Sectional Test"
              autoFocus
            />
          </div>
          <div>
            <label className={labelClass}>Code</label>
            <input
              className={`${inputClass} font-mono`}
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value);
              }}
              placeholder="sectional_test"
            />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className={buttonClass} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={primaryButtonClass} onClick={handleCreate} disabled={!name.trim() || !code.trim()}>
          Add kind
        </button>
      </Modal.Footer>
    </Modal>
  );
}
