"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FiEdit2, FiPlus } from "react-icons/fi";
import Drawer from "@/app/components/common/Drawer";
import {
  iconButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  primaryIconTextButtonClass,
} from "@/app/components/common/ui";
import { TagPairEditor } from "@/app/components/questions/TagPairEditor";
import type { ReferenceData, TagPair } from "@/app/lib/questions/schema";
import { createTagPairs, renameTag, renameTagDimension } from "@/app/lib/tags/actions";
import { notify } from "@/app/lib/shared/toast";

// ---- Create: key -> value pairs, exactly like the tag field on a question ----

// Opens a drawer with the same key → value editor the question form uses (type
// or pick a key, type or pick a value, add as many pairs as you like). Saving
// creates whatever doesn't exist yet. `initialKey` pre-fills the key of the
// first row — used on a key's own page so "Add value" only needs the value.
export function CreateTagsButton({
  referenceData,
  initialKey = "",
  label = "New tags",
}: {
  referenceData: ReferenceData;
  initialKey?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={primaryIconTextButtonClass} onClick={() => setOpen(true)}>
        <FiPlus size={14} /> {label}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New tags" subTitle="key → value, same as on a question" widthClass="max-w-lg">
        {/* Mounted only while open so the rows always start fresh. */}
        {open && <CreateTagsForm referenceData={referenceData} initialKey={initialKey} onDone={() => setOpen(false)} />}
      </Drawer>
    </>
  );
}

function CreateTagsForm({
  referenceData,
  initialKey,
  onDone,
}: {
  referenceData: ReferenceData;
  initialKey: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pairs, setPairs] = useState<TagPair[]>([{ key: initialKey, value: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    // A half-filled pair is a data-entry mistake — same rule as validateQuestion.
    for (const p of pairs) {
      const key = p.key.trim();
      const value = p.value.trim();
      if (key && !value) return setError(`"${key}" needs a value.`);
      if (!key && value) return setError(`Value "${value}" needs a key (e.g. "subject").`);
    }
    setError(null);
    setSaving(true);
    try {
      const res = await createTagPairs(pairs);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const parts = [
        res.dimensionsCreated > 0 ? `${res.dimensionsCreated} new key${res.dimensionsCreated === 1 ? "" : "s"}` : null,
        `${res.tagsCreated} new value${res.tagsCreated === 1 ? "" : "s"}`,
        res.tagsExisting > 0 ? `${res.tagsExisting} already existed` : null,
      ].filter(Boolean);
      notify(`Done — ${parts.join(", ")}.`, res.tagsCreated + res.dimensionsCreated > 0 ? "success" : "info");
      onDone();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TagPairEditor
        tags={pairs}
        referenceData={referenceData}
        onUpdate={(i, patch) => setPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))}
        onAdd={() => setPairs((prev) => [...prev, { key: "", value: "" }])}
        onRemove={(i) =>
          setPairs((prev) => {
            const next = prev.filter((_, idx) => idx !== i);
            return next.length ? next : [{ key: "", value: "" }];
          })
        }
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="button" className={primaryButtonClass} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Create"}
        </button>
      </div>
    </div>
  );
}

// ---- Edit: rename a key / a value ----

// Pencil button + small drawer to rename. `kind` decides the wording and which
// action runs: a key (TagDimension) or a value (Tag) under it.
export function RenameButton({
  kind,
  dimensionId,
  tagId,
  currentName,
}: {
  kind: "key" | "value";
  dimensionId: number;
  tagId?: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => setOpen(true)}
        aria-label={`Edit ${kind} ${currentName}`}
        title={`Edit ${kind}`}
      >
        <FiEdit2 size={13} />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Edit ${kind}`} widthClass="max-w-md">
        {open && (
          <RenameForm
            kind={kind}
            dimensionId={dimensionId}
            tagId={tagId}
            currentName={currentName}
            onDone={() => setOpen(false)}
          />
        )}
      </Drawer>
    </>
  );
}

function RenameForm({
  kind,
  dimensionId,
  tagId,
  currentName,
  onDone,
}: {
  kind: "key" | "value";
  dimensionId: number;
  tagId?: string;
  currentName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      setError(`The ${kind} cannot be empty.`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res =
        kind === "key" ? await renameTagDimension(dimensionId, name) : await renameTag(dimensionId, tagId!, name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      notify(`${kind === "key" ? "Key" : "Value"} updated.`, "success");
      onDone();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>
          {kind === "key" ? "Key" : "Value"} <span className="text-red-500">*</span>
        </label>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={kind === "key" ? 100 : 200}
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] text-zinc-500">
          {kind === "key"
            ? "Renaming keeps all its values and their questions."
            : "Renaming keeps it on all its questions. Their stored search text is refreshed the next time each question is saved."}
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="button" className={primaryButtonClass} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
