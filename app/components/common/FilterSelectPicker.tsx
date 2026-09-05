"use client";

import { useState } from "react";
import { AppSelectPicker, type SelectOption } from "@/app/components/common/AppSelectPicker";

// Wraps AppSelectPicker with local state mirrored into a hidden input, so a
// plain <form method="GET"> filter bar can use it without a submit handler.
export function FilterSelectPicker<T extends string | number>({
  name,
  data,
  defaultValue,
  placeholder,
}: {
  name: string;
  data: SelectOption<T>[];
  defaultValue: T | null;
  placeholder?: string;
}) {
  const [value, setValue] = useState<T | null>(defaultValue);

  return (
    <>
      <AppSelectPicker
        data={data}
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        cleanable
        block
      />
      {value !== null && <input type="hidden" name={name} value={value} />}
    </>
  );
}
