"use client";

import { useMemo, useState } from "react";
import { TagPicker } from "rsuite";
import type { ReferenceData } from "@/app/lib/questionSchema";

type Option = { label: string; value: string };

// Cascading multi-select: pick one or more tag keys (dimensions), then pick
// one or more values from the union of tags belonging to those keys. Picks
// are mirrored into hidden inputs so the surrounding plain GET <form> still
// submits repeated `tagKey=`/`tagValue=` params without any JS submit handler.
export function TagFilterPicker({
  referenceData,
  defaultKeys,
  defaultValues,
}: {
  referenceData: ReferenceData;
  defaultKeys: string[];
  defaultValues: string[];
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(defaultKeys);
  const [selectedValues, setSelectedValues] = useState<string[]>(defaultValues);

  const keyOptions: Option[] = useMemo(
    () => referenceData.dimensions.map((d) => ({ label: d.name, value: d.name })),
    [referenceData.dimensions]
  );

  const selectedDimensionIds = useMemo(() => {
    const lowerKeys = new Set(selectedKeys.map((k) => k.toLowerCase()));
    return referenceData.dimensions
      .filter((d) => lowerKeys.has(d.name.toLowerCase()))
      .map((d) => d.id);
  }, [selectedKeys, referenceData.dimensions]);

  const valueOptions: Option[] = useMemo(() => {
    const seenLower = new Set<string>();
    const options: Option[] = [];
    for (const dimId of selectedDimensionIds) {
      for (const tag of referenceData.tagsByDimensionId[dimId] ?? []) {
        const lower = tag.name.toLowerCase();
        if (!seenLower.has(lower)) {
          seenLower.add(lower);
          options.push({ label: tag.name, value: tag.name });
        }
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [selectedDimensionIds, referenceData.tagsByDimensionId]);

  function handleKeysChange(keys: string[]) {
    setSelectedKeys(keys);

    const lowerKeys = new Set(keys.map((k) => k.toLowerCase()));
    const allowedDimIds = referenceData.dimensions
      .filter((d) => lowerKeys.has(d.name.toLowerCase()))
      .map((d) => d.id);
    const allowedValueNamesLower = new Set(
      allowedDimIds.flatMap((id) =>
        (referenceData.tagsByDimensionId[id] ?? []).map((t) => t.name.toLowerCase())
      )
    );
    setSelectedValues((prev) => prev.filter((v) => allowedValueNamesLower.has(v.toLowerCase())));
  }

  return (
    <>
      <TagPicker
        data={keyOptions}
        value={selectedKeys}
        onChange={(keys) => handleKeysChange(keys ?? [])}
        placeholder="Tag key(s)"
        searchable
        cleanable
        block
      />
      <TagPicker
        data={valueOptions}
        value={selectedValues}
        onChange={(values) => setSelectedValues(values ?? [])}
        placeholder="Tag value(s)"
        disabled={valueOptions.length === 0}
        searchable
        cleanable
        block
      />
      {selectedKeys.map((k) => (
        <input key={`key-${k}`} type="hidden" name="tagKey" value={k} />
      ))}
      {selectedValues.map((v) => (
        <input key={`value-${v}`} type="hidden" name="tagValue" value={v} />
      ))}
    </>
  );
}
