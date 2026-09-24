"use client";

// A small on/off pill — used for negative marking (optional per section, off
// by default so a fresh section doesn't imply a penalty the admin never
// chose) and the exam-wide behaviour switches.
export default function SwitchToggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-zinc-900" : "bg-zinc-200"
        }`}
    >
      <span
        className={`absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"
          }`}
      />
    </button>
  );
}
