import { NextResponse } from "next/server";
import { requireAuth } from "@/app/lib/auth/auth";
import { MEDIA_ACCEPT, MEDIA_FOLDER, MEDIA_MAX_BYTES, type MediaKind } from "@/app/lib/auth/media";

// Same upload endpoint the legacy React admin's uploadApi.ts posts to
// (`${REACT_APP_APIBaseUrl}/uploads`) — this route exists only to attach the
// signed-in user's token (held in an httpOnly cookie, unreadable from client
// JS) and to report XHR upload progress back to the browser; the LMS is the
// only place files are actually stored.
const UPLOAD_URL = `${process.env.API_ENDPOINT_URL}/uploads`;

// LMS response shape: { result: { DocumentId, returnPath } } for a single
// file. `result` occasionally comes back as a JSON string rather than an
// object (see the legacy app's `convertData` helper) — handle both.
function parseResult(result: unknown): { DocumentId?: unknown; returnPath?: unknown } {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return {};
    }
  }
  return (result as Record<string, unknown>) ?? {};
}

export async function POST(request: Request) {
  const token = await requireAuth();

  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (typeof kind !== "string" || !(kind in MEDIA_ACCEPT)) {
    return NextResponse.json({ error: "Invalid or missing 'kind'." }, { status: 400 });
  }
  const mediaKind = kind as MediaKind;

  const allowedMimes = MEDIA_ACCEPT[mediaKind].split(",");
  if (file.type && !allowedMimes.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}" for ${mediaKind}.` },
      { status: 400 },
    );
  }
  if (file.size > MEDIA_MAX_BYTES[mediaKind]) {
    return NextResponse.json(
      {
        error: `File is too large. Max size for ${mediaKind} is ${Math.round(
          MEDIA_MAX_BYTES[mediaKind] / (1024 * 1024),
        )} MB.`,
      },
      { status: 400 },
    );
  }

  const folderPath = (form.get("folderPath") as string | null) || MEDIA_FOLDER[mediaKind];
  const documentTitle = (form.get("title") as string | null) || file.name;

  const upstream = new FormData();
  upstream.append("FileDetails", file, file.name);
  upstream.append("folderPath", folderPath);
  upstream.append("DocumentTitle", documentTitle);
  upstream.append("key", "");
  upstream.append("IsEncrypt", "false");

  const upstreamRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: upstream,
  });
  const body = await upstreamRes.json().catch(() => null);

  const { DocumentId, returnPath } = parseResult(body?.result);
  if (!upstreamRes.ok || DocumentId == null || !returnPath) {
    const message =
      (Array.isArray(body?.errorMessages) && body.errorMessages.join(" ")) || "Upload failed.";
    return NextResponse.json({ error: message }, { status: upstreamRes.ok ? 502 : upstreamRes.status });
  }

  return NextResponse.json({ id: String(DocumentId), url: String(returnPath) });
}
