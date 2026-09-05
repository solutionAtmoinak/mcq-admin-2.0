"use client";

import { Modal } from "rsuite";
import { MediaAttachmentField } from "@/app/components/MediaAttachmentField";
import { buttonClass } from "@/app/components/ui";
import type { AttachedMedia } from "@/app/lib/media";

export default function OptionMediaModal({
  open,
  onClose,
  optionLabel,
  media,
  onChange,
  folderPath,
}: {
  open: boolean;
  onClose: () => void;
  optionLabel: string;
  media: AttachedMedia | null | undefined;
  onChange: (media: AttachedMedia | null) => void;
  folderPath?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} size="xs">
      <Modal.Header>
        <Modal.Title>{optionLabel} media</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <MediaAttachmentField media={media} onChange={onChange} folderPath={folderPath} />
      </Modal.Body>
      <Modal.Footer>
        <button className={buttonClass} onClick={onClose}>
          Done
        </button>
      </Modal.Footer>
    </Modal>
  );
}
