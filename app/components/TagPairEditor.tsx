"use client";

import { useMemo } from "react";
import type { ReferenceData, TagPair } from "@/app/lib/questionSchema";
import { inputClass, buttonClass } from "@/app/components/ui";

export const DIMENSION_DATALIST_ID = "tag-dimension-keys";

export function TagDimensionDatalist({ dimensions }: { dimensions: ReferenceData["dimensions"] }) {
  return (
    <datalist id={DIMENSION_DATALIST_ID}>
      {dimensions.map((d) => (
        <option key={d.id} value={d.name} />
      ))}
    </datalist>
  );
}

// Dynamic key/value tag input. `key` is a tag dimension (e.g. "subject"),
// `value` is a tag name within that dimension (e.g. "Reasoning"). Both are
// free-text with autocomplete: pick an existing one, or type something new
// and it gets created automatically on save.
export function TagPairEditor({
  tags,
  referenceData,
  idPrefix,
  onUpdate,
  onAdd,
  onRemove,
}: {
  tags: TagPair[];
  referenceData: ReferenceData;
  idPrefix: string;
  onUpdate: (index: number, patch: Partial<TagPair>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const dimensionByLowerName = useMemo(() => {
    const map = new Map<string, ReferenceData["dimensions"][number]>();
    for (const d of referenceData.dimensions) map.set(d.name.toLowerCase(), d);
    return map;
  }, [referenceData.dimensions]);

  return (
    <div className="flex flex-col gap-2">
      {tags.map((tag, i) => {
        const matchedDim = dimensionByLowerName.get(tag.key.trim().toLowerCase());
        const valueOptions = matchedDim
          ? referenceData.tagsByDimensionId[matchedDim.id] ?? []
          : [];
        const valueListId = `${idPrefix}-tagval-${i}`;
        const isNewKey = tag.key.trim() && !matchedDim;
        const isNewValue =
          tag.value.trim() &&
          matchedDim &&
          !valueOptions.some((v) => v.name.toLowerCase() === tag.value.trim().toLowerCase());

        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <input
              className={`${inputClass} min-w-26 flex-1 basis-24`}
              list={DIMENSION_DATALIST_ID}
              value={tag.key}
              onChange={(e) => onUpdate(i, { key: e.target.value })}
              placeholder="key"
            />
            <span className="shrink-0 text-zinc-400">→</span>
            <input
              className={`${inputClass} min-w-28 flex-2 basis-32`}
              list={valueListId}
              value={tag.value}
              onChange={(e) => onUpdate(i, { value: e.target.value })}
              placeholder="value"
            />
            <datalist id={valueListId}>
              {valueOptions.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
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
