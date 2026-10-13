"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "rsuite";
import { FiEye } from "react-icons/fi";
import { buttonClass, iconButtonClass, primaryButtonClass } from "@/app/components/common/ui";
import { loadTagDimension } from "@/app/lib/tags/actions";
import type { TagDimensionDetail } from "@/app/lib/tags/data";
import { notify } from "@/app/lib/shared/toast";

// The eye on a key row: opens a read-only view of every value under it — name,
// created date and how many questions carry it. Each value's own eye goes to the
// question bank filtered by that key + value; "Manage values" opens the full
// key page where values are added and edited.
export default function DimensionViewButton({
  dimensionId,
  dimensionName,
}: {
  dimensionId: number;
  dimensionName: string;
}) {
  const [open, setOpen] = useState(false);
  // null while loading; loaded fresh on every open so counts are current.
  const [detail, setDetail] = useState<TagDimensionDetail | null>(null);

  async function handleOpen() {
    setDetail(null);
    setOpen(true);
    const res = await loadTagDimension(dimensionId);
    if (!res.ok) {
      notify(res.error, "error");
      setOpen(false);
      return;
    }
    setDetail(res.dimension);
  }

  return (
    <>
      <button
        type="button"
        className={iconButtonClass}
        onClick={handleOpen}
        aria-label={`View values of ${dimensionName}`}
        title="View values"
      >
        <FiEye size={14} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} size="md">
        <Modal.Header>
          <Modal.Title>Values of {dimensionName}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!detail ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : detail.tags.length === 0 ? (
            <p className="text-sm text-zinc-500">No values under this key yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200">
              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">Questions</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {detail.tags.map((t) => (
                      <tr key={t.tagId}>
                        <td className="px-3 py-2 font-medium text-zinc-900">{t.name}</td>
                        <td className="px-3 py-2 text-zinc-500">{new Date(t.createdOn).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-zinc-700">{t.questionCount}</td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/questions?tagKey=${encodeURIComponent(detail.name)}&tagValue=${encodeURIComponent(t.name)}`}
                            className={`${iconButtonClass} ${t.questionCount === 0 ? "pointer-events-none opacity-40" : ""}`}
                            aria-label={`View questions tagged ${t.name}`}
                            title={t.questionCount === 0 ? "No questions use this value yet" : "View these questions"}
                            aria-disabled={t.questionCount === 0}
                          >
                            <FiEye size={13} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
            Close
          </button>
          <Link href={`/tags/${dimensionId}`} className={primaryButtonClass}>
            Manage values
          </Link>
        </Modal.Footer>
      </Modal>
    </>
  );
}
