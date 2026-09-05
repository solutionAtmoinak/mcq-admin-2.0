"use client";

import { useState } from "react";
import { FiImage, FiMusic, FiVideo } from "react-icons/fi";
import { MediaUploader } from "@/app/components/MediaUploader";
import { buttonClass, primaryButtonClass } from "@/app/components/ui";
import type { AttachedMedia, MediaKind, MediaUploadResult } from "@/app/lib/media";

const KIND_TABS: { value: MediaKind; label: string; icon: typeof FiImage }[] = [
  { value: "image", label: "Image", icon: FiImage },
  { value: "audio", label: "Audio", icon: FiMusic },
  { value: "video", label: "Video", icon: FiVideo },
];

// A single image/audio/video attachment (picked via the tabs below). The
// kind is locked once something's uploaded — MediaUploader's own remove
// button (backed by a real LMS delete) has to clear it before a different
// kind can be picked, so switching kind mid-attachment never leaves an
// orphaned upload behind on the LMS. Used for both a question's own
// attachment (QuestionOptionalSettingsModal) and an option's (OptionMediaModal).
export function MediaAttachmentField({
  media,
  onChange,
  folderPath,
}: {
  media: AttachedMedia | null | undefined;
  onChange: (media: AttachedMedia | null) => void;
  folderPath?: string;
}) {
  const [pickedKind, setPickedKind] = useState<MediaKind>("image");
  const effectiveKind = media?.kind ?? pickedKind;
  const value: MediaUploadResult[] = media ? [{ id: media.id, url: media.url }] : [];

  function handleUploaderChange(next: MediaUploadResult[]) {
    const item = next[0];
    onChange(item ? { kind: effectiveKind, ...item } : null);
  }

  return (
    <div className="flex flex-col gap-3">
      {!media && (
        <div className="flex gap-1.5">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`${pickedKind === tab.value ? primaryButtonClass : buttonClass} inline-flex items-center gap-1.5 !px-2.5 !py-1 text-xs`}
              onClick={() => setPickedKind(tab.value)}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <MediaUploader kind={effectiveKind} value={value} onChange={handleUploaderChange} folderPath={folderPath} />
    </div>
  );
}
