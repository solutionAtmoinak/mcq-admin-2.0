"use client";

import { useEffect, useRef, useState } from "react";
import { FiLoader, FiUploadCloud, FiX } from "react-icons/fi";
import {
  dangerIconButtonClass,
  iconTextButtonClass,
  labelClass,
} from "@/app/components/common/ui";
import {
  MEDIA_ACCEPT,
  MEDIA_MAX_BYTES,
  formatBytes,
  type MediaKind,
  type MediaUploadResult,
} from "@/app/lib/auth/media";
import { deleteMediaFile, uploadMediaFile } from "@/app/lib/auth/mediaApi";
import { notify } from "@/app/lib/shared/toast";

// A file mid-upload, not yet part of the committed `value` the parent owns.
// Committed (already-uploaded) files are rendered straight from `value` —
// there's no local copy of them, so there's nothing to keep in sync when the
// parent swaps `value` out (e.g. switching which question is being edited).
type PendingSlot = {
  key: string;
  progress: number;
  previewUrl: string;
  size: number;
};

let slotKeyCounter = 0;
function nextSlotKey(): string {
  slotKeyCounter += 1;
  return `media-${Date.now().toString(36)}-${slotKeyCounter}`;
}

// Generic uploader for question/option image, audio, video and document
// attachments. Uploads immediately on file selection (POST /api/media, one
// request per file, tracked with XMLHttpRequest for progress) and hands back
// the committed {id, url} pairs via onChange — id is the MediaAsset row to
// reference from question/option JSON, url is where to display/play it back.
export function MediaUploader({
  kind,
  label,
  required,
  disabled,
  multiple = false,
  value,
  onChange,
  accept,
  className,
  folderPath,
  title,
}: {
  kind: MediaKind;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  value: MediaUploadResult[];
  onChange: (value: MediaUploadResult[]) => void;
  accept?: string;
  className?: string;
  // Forwarded to the LMS as folderPath/DocumentTitle — see UploadOptions in
  // app/lib/auth/mediaApi.ts. Leave unset to fall back to MEDIA_FOLDER[kind] and
  // the file's own name.
  folderPath?: string;
  title?: string;
}) {
  const [pending, setPending] = useState<PendingSlot[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || disabled) return;
    const picked = multiple ? Array.from(files) : [files[0]];

    const maxBytes = MEDIA_MAX_BYTES[kind];
    const valid = picked.filter((file) => {
      if (file.size > maxBytes) {
        notify(`"${file.name}" is too large (max ${formatBytes(maxBytes)}).`, "error");
        return false;
      }
      return true;
    });
    if (valid.length === 0) return;

    // Single mode replaces whatever is already there — delete the old
    // file(s) first (best-effort) so an abandoned upload never leaves an
    // orphaned file behind on the LMS, then clear the committed value so
    // the new upload starts from a clean slot.
    if (!multiple && value.length > 0) {
      await Promise.all(value.map((v) => deleteMediaFile(v.id).catch(() => {})));
      onChange([]);
    }

    const newSlots: PendingSlot[] = valid.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return { key: nextSlotKey(), progress: 0, previewUrl, size: file.size };
    });
    setPending((prev) => (multiple ? [...prev, ...newSlots] : newSlots));

    valid.forEach((file, i) => {
      const slotKey = newSlots[i].key;
      uploadMediaFile(
        file,
        kind,
        (percent) => {
          setPending((prev) => prev.map((s) => (s.key === slotKey ? { ...s, progress: percent } : s)));
        },
        { folderPath, title },
      )
        .then((result) => {
          setPending((prev) => prev.filter((s) => s.key !== slotKey));
          onChange(multiple ? [...value, result] : [result]);
        })
        .catch((err: Error) => {
          notify(err.message || "Upload failed.", "error");
          setPending((prev) => prev.filter((s) => s.key !== slotKey));
        });
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemove(item: MediaUploadResult) {
    try {
      await deleteMediaFile(item.id);
      onChange(value.filter((v) => v.id !== item.id));
      notify("Removed.", "success");
    } catch (err) {
      notify((err as Error).message || "Delete failed.", "error");
    }
  }

  const isEmpty = value.length === 0 && pending.length === 0;

  return (
    <div className={className}>
      {label && (
        <label className={labelClass}>
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      <div className="flex flex-col gap-2">
        <label
          className={`${iconTextButtonClass} w-fit ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
          <FiUploadCloud size={14} />
          {multiple ? "Add files" : isEmpty ? "Upload file" : "Replace file"}
          <input
            ref={fileInputRef}
            type="file"
            accept={accept ?? MEDIA_ACCEPT[kind]}
            multiple={multiple}
            disabled={disabled}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        {!isEmpty && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {value.map((item) => (
              <div key={item.id} className="relative rounded-md border border-zinc-200 bg-zinc-50 p-2">
                <MediaPreview kind={kind} src={item.url} />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    title="Remove"
                    className={`${dangerIconButtonClass} absolute -top-2 -right-2 h-5 w-5`}
                  >
                    <FiX size={11} />
                  </button>
                )}
              </div>
            ))}

            {pending.map((slot) => (
              <div key={slot.key} className="relative rounded-md border border-zinc-200 bg-zinc-50 p-2">
                <MediaPreview kind={kind} src={slot.previewUrl} />
                <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                  <FiLoader className="animate-spin" size={11} />
                  {slot.progress}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaPreview({ kind, src }: { kind: MediaKind; src: string }) {
  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob:/api-served urls, not a static asset next/image can optimize
      <img src={src} alt="" className="h-20 w-full rounded object-cover" />
    );
  }
  if (kind === "audio") {
    return <audio src={src} controls className="w-full" />;
  }
  if (kind === "video") {
    return <video src={src} controls className="h-20 w-full rounded object-cover" />;
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block truncate text-sm text-blue-600 underline">
      View document
    </a>
  );
}
