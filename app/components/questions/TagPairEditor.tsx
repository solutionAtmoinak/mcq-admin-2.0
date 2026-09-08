"use client";

import { useMemo } from "react";
import { InputPicker } from "rsuite";
import type { ReferenceData, TagPair } from "@/app/lib/questions/schema";
import { buttonClass } from "@/app/components/common/ui";

type Option = { label: string; value: string };

// Dynamic key/value tag input. `key` is a tag dimension (e.g. "subject"),
// `value` is a tag name within that dimension (e.g. "Reasoning"). Both use a
// searchable combobox — matching the tag filter on the browse page — that
// also lets you type something new: pick an existing option, or type a name
// that doesn't exist yet and it gets created automatically on save.
export function TagPairEditor({
  tags,
  referenceData,
  onUpdate,
  onAdd,
  onRemove,
}: {
  tags: TagPair[];
  referenceData: ReferenceData;
  onUpdate: (index: number, patch: Partial<TagPair>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const dimensionByLowerName = useMemo(() => {
    const map = new Map<string, ReferenceData["dimensions"][number]>();
    for (const d of referenceData.dimensions) map.set(d.name.toLowerCase(), d);
    return map;
  }, [referenceData.dimensions]);

  const dimensionOptions: Option[] = useMemo(
    () => referenceData.dimensions.map((d) => ({ label: d.name, value: d.name })),
    [referenceData.dimensions]
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-400">Type to add a new key or value — it&apos;s created automatically when you save.</p>
      {tags.map((tag, i) => {
        const matchedDim = dimensionByLowerName.get(tag.key.trim().toLowerCase());
        const valueOptions: Option[] = matchedDim
          ? (referenceData.tagsByDimensionId[matchedDim.id] ?? []).map((v) => ({ label: v.name, value: v.name }))
          : [];
        const isNewKey = !!tag.key.trim() && !matchedDim;
        const isNewValue =
          !!tag.value.trim() &&
          !!matchedDim &&
          !valueOptions.some((v) => v.value.toLowerCase() === tag.value.trim().toLowerCase());

        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <InputPicker
              data={dimensionOptions}
              value={tag.key || null}
              onChange={(v) => onUpdate(i, { key: v ?? "" })}
              creatable
              cleanable
              size="sm"
              placeholder="key"
              className="min-w-26 flex-1 basis-24"
            />
            <span className="shrink-0 text-zinc-400">→</span>
            <InputPicker
              data={valueOptions}
              value={tag.value || null}
              onChange={(v) => onUpdate(i, { value: v ?? "" })}
              creatable
              cleanable
              size="sm"
              placeholder="value"
              className="min-w-28 flex-2 basis-32"
            />
            {(isNewKey || isNewValue) && (
              <span
                className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                title="This will be created when you save"
              >
                new
              </span>
            )}
            <button
              className={`${buttonClass} shrink-0`}
              onClick={() => onRemove(i)}
              disabled={tags.length <= 1}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button className={`${buttonClass} w-fit`} onClick={onAdd}>
        + Add tag
      </button>
    </div>
  );
}
