// Shared types/constants for media uploads (question/option image, audio,
// video, and other document attachments). No server-only imports here — used
// by both the /api/media route and the client-side MediaUploader component.
//
// There's no storage or DB table of our own here — uploads are proxied
// straight through to the existing LMS upload API (API_ENDPOINT_URL/uploads,
// same endpoint the legacy React admin's uploadApi.ts posts to). This app
// only forwards the file with the signed-in user's token attached (see
// app/api/media/route.ts) and normalizes the response to {id, url}.

export type MediaKind = "image" | "audio" | "video" | "document";

export type MediaUploadResult = {
  id: string;
  url: string;
};

// A single {id, url} attachment plus which kind it was uploaded as — the
// shape stored on a question or an option (see QuestionInput/OptionInput in
// app/lib/questions/schema.ts), since an attachment isn't always an image.
export type AttachedMedia = MediaUploadResult & { kind: MediaKind };

export const MEDIA_ACCEPT: Record<MediaKind, string> = {
  image: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
  audio: "audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm",
  video: "video/mp4,video/webm,video/ogg,video/quicktime",
  document: "application/pdf",
};

export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 150 * 1024 * 1024,
  document: 15 * 1024 * 1024,
};

// Default LMS folderPath per kind (see UploadComp's `folderPath` prop in the
// legacy app) — used unless the caller passes its own, e.g. once wired into
// a question form: `question-bank/{questionCode}/stem-image`.
export const MEDIA_FOLDER: Record<MediaKind, string> = {
  image: "question-bank/images",
  audio: "question-bank/audio",
  video: "question-bank/video",
  document: "question-bank/documents",
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
