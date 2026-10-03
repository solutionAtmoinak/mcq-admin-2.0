"use client";

import { useState } from "react";
import { TagPicker } from "rsuite";
import type { QuestionLotOption } from "@/app/lib/questions/data";

// Multi-select lot filter for the question bank list — each option shows
// how many questions sit in that lot, same label convention as the exam
// question picker's own (single-select) lot dropdown. Picks are mirrored
// into hidden `lotId` inputs so the surrounding plain GET <form> still
// submits repeated `lotId=` params without any JS submit handler, same
// pattern as TagFilterPicker.
export function LotFilterPicker({
  lots,
  defaultValues,
}: {
  lots: QuestionLotOption[];
  defaultValues: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValues);

  const data = lots.map((l) => ({ label: `${l.lotNo} (${l.questionCount})`, value: l.lotId }));

  return (
    <>
      <TagPicker
        data={data}
        value={selected}
        onChange={(values) => setSelected(values ?? [])}
        placeholder="All lots"
        searchable
        cleanable
        block
      />
      {selected.map((v) => (
        <input key={v} type="hidden" name="lotId" value={v} />
      ))}
    </>
  );
}
