import type { MediaKind, MediaUploadResult } from "./media";

export type UploadProgressHandler = (percent: number) => void;

export type UploadOptions = {
  // Passed through to the LMS's folderPath/DocumentTitle fields — defaults
  // to MEDIA_FOLDER[kind] / the file's own name when omitted (see
  // app/api/media/route.ts). Once wired into a question/option field, pass
  // something like `question-bank/${questionCode}/stem-image` here.
  folderPath?: string;
  title?: string;
};

// XMLHttpRequest, not fetch: fetch has no cross-browser way to report
// upload-body progress, and MediaUploader shows a per-file progress bar.
export function uploadMediaFile(
  file: File,
  kind: MediaKind,
  onProgress?: UploadProgressHandler,
  options?: UploadOptions,
): Promise<MediaUploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    if (options?.folderPath) formData.append("folderPath", options.folderPath);
    if (options?.title) formData.append("title", options.title);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON response, handled by the status check below
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        resolve(body as MediaUploadResult);
      } else {
        reject(new Error((body as { error?: string } | null)?.error || "Upload failed."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.send(formData);
  });
}

export async function deleteMediaFile(id: string): Promise<void> {
  const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Delete failed.");
  }
}
