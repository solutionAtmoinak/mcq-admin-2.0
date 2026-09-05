"use client";

import { useEffect } from "react";

// rsuite pickers (SelectPicker/TagPicker/InputPicker) portal their open
// popup straight to document.body at a low z-index (7 by default), only
// escalating it — via the `.rs-drawer-open .rs-picker-popup` rule already
// shipped in rsuite's own CSS — when something has marked the body with
// `rs-drawer-open`. rsuite's own Drawer/Modal do that marking themselves;
// this plain Tailwind Drawer isn't rsuite, so it has to do it too, or any
// picker opened inside one renders invisibly behind this panel.
//
// Locking body scroll is the other half of what rsuite's own overlays do
// automatically, and it isn't just a nicety here: this Drawer is
// position:fixed (viewport-relative), but a picker's open popup is
// position:absolute (document-relative, since it's portaled to
// document.body). rsuite repositions that popup on window scroll by
// shifting it by the scroll delta — correct for a trigger that scrolls
// with the document, wrong for one that's actually fixed and never moved.
// So scrolling the page *behind* the drawer was dragging every open
// dropdown out of alignment with its own trigger. If the background can't
// scroll at all while a drawer's open, there's no delta to misapply.
//
// Both markers are reference counted so nested/multiple open Drawers can't
// have one's close wipe them out from under another that's still open.
let openDrawerCount = 0;
let bodyOverflowBeforeLock: string | null = null;
function markDrawerOpen() {
  openDrawerCount += 1;
  document.body.classList.add("rs-drawer-open");
  if (openDrawerCount === 1) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
function markDrawerClosed() {
  openDrawerCount = Math.max(0, openDrawerCount - 1);
  if (openDrawerCount === 0) {
    document.body.classList.remove("rs-drawer-open");
    document.body.style.overflow = bodyOverflowBeforeLock ?? "";
    bodyOverflowBeforeLock = null;
  }
}

// Generic slide-in side panel. Stays mounted while closed (translated
// off-screen + pointer-events disabled) so any form state inside survives
// being opened and closed repeatedly.
export default function Drawer({
  open,
  onClose,
  title,
  widthClass = "max-w-md",
  footer,
  scrollableBody = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  widthClass?: string;
  // Optional pinned action bar below the body — for content long enough to
  // scroll (e.g. a filtered table), this keeps primary actions like "Add"
  // always reachable instead of scrolling away with the list.
  footer?: React.ReactNode;
  // Set false when the caller has its own internal scroll region (e.g. a
  // results table that should scroll while filter controls above it stay
  // put). The body then gets a fixed height instead of scrolling itself —
  // letting both it and a nested scroll area scroll independently is what
  // sends an open dropdown's position drifting, since a popover positioned
  // against its trigger on open doesn't track a later scroll of an
  // *ancestor* container. The caller's children must fill the space
  // themselves (h-full flex flex-col, with overflow-y-auto on the one part
  // that should scroll).
  scrollableBody?: boolean;
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

  useEffect(() => {
    if (!open) return;
    markDrawerOpen();
    return markDrawerClosed;
  }, [open]);

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
        <div className={`flex-1 px-5 py-4 ${scrollableBody ? "overflow-y-auto" : "overflow-hidden"}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-zinc-200 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
