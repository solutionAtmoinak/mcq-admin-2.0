"use client";

import { useMemo, useState } from "react";
import { Modal } from "rsuite";
import { buttonClass, inputClass, primaryButtonClass } from "@/app/components/common/ui";
import type { PackageOption } from "@/app/lib/exams/packages";
import type { MockTestPackageLink } from "@/app/lib/exams/data";

type Option = { label: string; value: number };

export default function LinkPackagesModal({
  open,
  onClose,
  examName,
  packageOptions,
  packagesError,
  initialPackages,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  examName: string;
  packageOptions: PackageOption[];
  packagesError: string | null;
  initialPackages: MockTestPackageLink[];
  saving: boolean;
  onSave: (packageIds: number[]) => void;
}) {
  const initialSelectedIds = useMemo(
    () => new Set(initialPackages.map((p) => Number(p.packageId))),
    [initialPackages],
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialSelectedIds));
  const [search, setSearch] = useState("");


  const options: Option[] = useMemo(() => {
    const byValue = new Map(packageOptions.map((o) => [o.value, o]));
    for (const p of initialPackages) {
      const value = Number(p.packageId);
      if (!byValue.has(value)) byValue.set(value, { label: `Package #${value}`, value });
    }
    return [...byValue.values()].sort((a, b) => {
      const aLinked = initialSelectedIds.has(a.value);
      const bLinked = initialSelectedIds.has(b.value);
      if (aLinked !== bLinked) return aLinked ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [packageOptions, initialPackages, initialSelectedIds]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  function toggle(value: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function handleSave() {
    onSave([...selected]);
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <Modal.Header>
        <Modal.Title>Link packages — {examName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2 text-xs text-zinc-500">
          Students who own any of the selected packages will get access to this exam.
        </p>
        {packagesError ? (
          <p className="text-sm text-red-600">{packagesError}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search packages…"
              />
              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
                {selected.size} selected
              </span>
            </div>
            <div className="h-64 overflow-y-auto rounded-md border border-zinc-200">
              {filteredOptions.length === 0 ? (
                <p className="p-3 text-sm text-zinc-400">
                  {options.length === 0 ? "No packages found." : "No packages match your search."}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {filteredOptions.map((o) => (
                    <li key={o.value}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={selected.has(o.value)}
                          onChange={() => toggle(o.value)}
                          className="h-4 w-4 shrink-0 rounded border-zinc-300"
                        />
                        {o.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className={buttonClass} onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          onClick={handleSave}
          disabled={saving || !!packagesError}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
