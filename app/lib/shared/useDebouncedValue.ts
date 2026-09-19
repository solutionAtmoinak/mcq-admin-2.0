"use client";

import { useEffect, useState } from "react";

// Delays reflecting `value` until it's stopped changing for `delayMs`.
// Generic — used internally by app/components/common/MathText.tsx to keep
// MathJax's `dynamic` re-typesetting (a relatively expensive TeX-parse +
// DOM rebuild) from running on every keystroke while typing math. Callers
// of MathText don't need to know this hook exists; the raw input field
// they bind to stays un-debounced, so typing itself is never delayed —
// only the live math preview is.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
