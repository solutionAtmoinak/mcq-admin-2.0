"use client";

import { useEffect } from "react";

// Generic slide-in side panel. Stays mounted while closed (translated
// off-screen + pointer-events disabled) so any form state inside survives
// being opened and closed repeatedly.
export default function Drawer({
  open,
  onClose,
  title,
  widthClass = "max-w-md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  widthClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute right-0 top-0 flex h-full w-full ${widthClass} flex-col bg-white shadow-xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <button
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
