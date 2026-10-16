"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "rsuite";
import { FiEdit2, FiEye, FiLoader, FiPlus, FiTrash2 } from "react-icons/fi";
import Swal from "sweetalert2";
import Drawer from "@/app/components/common/Drawer";
import { MathText } from "@/app/components/common/MathText";
import {
  buttonClass,
  dangerIconButtonClass,
  iconButtonClass,
  primaryIconTextButtonClass,
} from "@/app/components/common/ui";
import { CaseStudyForm, paragraphClass } from "@/app/components/questions/CaseStudyParts";
import type { CaseStudyRef } from "@/app/lib/questions/caseStudy";
import { deleteCaseStudy, loadCaseStudy } from "@/app/lib/questions/actions";
import type { CaseStudyDetail } from "@/app/lib/questions/data";
import { notify } from "@/app/lib/shared/toast";

// "New case study" on the Case Studies page: the same title + paragraph form the
// question editor uses (text / HTML / LaTeX, or read from a Word file), in a drawer.
export function NewCaseStudyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={primaryIconTextButtonClass} onClick={() => setOpen(true)}>
        <FiPlus size={14} /> New case study
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New case study"
        subTitle="A paragraph that several questions can share"
        widthClass="max-w-xl"
      >
        {/* Mounted only while open so every opening starts with an empty form. */}
        {open && (
          <CaseStudyForm
            initial={null}
            editing={false}
            saveLabel="Save case study"
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </Drawer>
    </>
  );
}

// The per-row actions: eye (read the full paragraph), pencil (edit — saved as a new
// version) and delete (blocked while questions or exams still use it).
export function CaseStudyRowActions({
  groupId,
  title,
  versionNo,
  questionCount,
  examCount,
}: {
  groupId: string;
  title: string;
  versionNo: number;
  questionCount: number;
  examCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // null while a view/edit is loading; `kind` says which dialog the loaded detail is for.
  const [panel, setPanel] = useState<{ kind: "view" | "edit"; detail: CaseStudyDetail | null } | null>(null);

  const blockedReason =
    questionCount > 0
      ? `Cannot delete: ${questionCount} question${questionCount === 1 ? " is" : "s are"} attached to it.`
      : examCount > 0
        ? `Cannot delete: used in ${examCount} exam${examCount === 1 ? "" : "s"}.`
        : null;

  async function open(kind: "view" | "edit") {
    setPanel({ kind, detail: null });
    const res = await loadCaseStudy(groupId);
    if (!res.ok) {
      notify(res.error, "error");
      setPanel(null);
      return;
    }
    // Ignore a late response if the dialog was closed meanwhile.
    setPanel((cur) => (cur?.kind === kind ? { kind, detail: res.caseStudy } : cur));
  }

  async function handleDelete() {
    const result = await Swal.fire({
      title: "Delete this case study?",
      text: `"${title}" will be removed from the case study list. It has no questions attached.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    startTransition(async () => {
      const res = await deleteCaseStudy(groupId);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify("Case study deleted.", "success");
      router.refresh();
    });
  }

  const detail = panel?.detail ?? null;
  const asRef = (d: CaseStudyDetail): CaseStudyRef => ({
    groupId: d.groupId,
    code: d.code,
    title: d.title,
    text: d.text,
  });

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => open("view")}
        aria-label={`View ${title}`}
        title="View full case study"
      >
        <FiEye size={14} />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => open("edit")}
        aria-label={`Edit ${title}`}
        title="Edit (saved as a new version)"
      >
        <FiEdit2 size={13} />
      </button>
      {/* A disabled button swallows hover, so the reason sits on the wrapper. */}
      <span title={blockedReason ?? "Delete case study"}>
        <button
          type="button"
          className={dangerIconButtonClass}
          onClick={handleDelete}
          disabled={isPending || blockedReason !== null}
          aria-label={`Delete ${title}`}
        >
          {isPending ? <FiLoader className="animate-spin" size={13} /> : <FiTrash2 size={13} />}
        </button>
      </span>

      <Modal open={panel?.kind === "view"} onClose={() => setPanel(null)} size="md">
        <Modal.Header>
          <Modal.Title>{detail ? detail.title || "Case study" : "Case study"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detail ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                {detail.code && <span className="font-mono">{detail.code}</span>}
                <span>version {detail.versionNo}</span>
                <span>
                  {detail.questions.length} question{detail.questions.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className={paragraphClass(detail.text)}>
                <MathText text={detail.text} inline={false} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Loading…</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className={buttonClass} onClick={() => setPanel(null)}>
            Close
          </button>
        </Modal.Footer>
      </Modal>

      <Drawer
        open={panel?.kind === "edit"}
        onClose={() => setPanel(null)}
        title="Edit case study"
        subTitle={`Saving creates version ${versionNo + 1}; questions using it show the new text, exams already built keep version ${versionNo}`}
        widthClass="max-w-xl"
      >
        {panel?.kind === "edit" &&
          (detail ? (
            <CaseStudyForm
              // Re-mount if a different load lands, so the form always starts from the loaded text.
              key={`${detail.groupId}-${detail.versionNo}`}
              initial={asRef(detail)}
              editing
              saveLabel={`Save as version ${detail.versionNo + 1}`}
              onSaved={() => {
                setPanel(null);
                router.refresh();
              }}
            />
          ) : (
            <p className="text-sm text-zinc-500">Loading…</p>
          ))}
      </Drawer>
    </div>
  );
}
