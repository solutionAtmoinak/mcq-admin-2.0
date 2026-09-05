import { NextResponse } from "next/server";
import { requireAuth } from "@/app/lib/auth";

const UPLOAD_URL = `${process.env.API_ENDPOINT_URL}/uploads`;

// Proxies to the same LMS endpoint the legacy React admin's uploadApi.ts
// deletes through (`${REACT_APP_APIBaseUrl}/uploads/{fileId}`) — no GET here
// since the `url` an upload returns is already a directly-usable LMS/CDN
// link, not something this app needs to serve itself.
export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/media/[id]">,
) {
  const token = await requireAuth();
  const { id } = await params;

  const upstreamRes = await fetch(`${UPLOAD_URL}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!upstreamRes.ok) {
    const body = await upstreamRes.json().catch(() => null);
    const message =
      (Array.isArray(body?.errorMessages) && body.errorMessages.join(" ")) || "Delete failed.";
    return NextResponse.json({ error: message }, { status: upstreamRes.status });
  }

  return NextResponse.json({ ok: true });
}
