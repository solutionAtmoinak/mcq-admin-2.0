"use client";

import { SelectPicker } from "rsuite";

export type SelectOption<T extends string | number> = { label: string; value: T };

// Shared single-value picker wrapping rsuite's SelectPicker so every
// type/difficulty/status dropdown in the app looks and behaves the same.
export function AppSelectPicker<T extends string | number>({
  data,
  value,
  onChange,
  placeholder,
  disabled,
  cleanable = false,
  searchable = false,
  block = false,
  className,
}: {
  data: SelectOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  placeholder?: string;
  disabled?: boolean;
  cleanable?: boolean;
  searchable?: boolean;
  block?: boolean;
  className?: string;
}) {
  return (
    <SelectPicker
      data={data}
      value={value}
      onChange={(v) => onChange((v as T | null) ?? null)}
      placeholder={placeholder}
      disabled={disabled}
      cleanable={cleanable}
      searchable={searchable}
      block={block}
      size="sm"
      className={className}
    />
  );
}
