import { NextResponse } from "next/server";
import { setAuthCookie, validateWithLms } from "@/app/lib/auth/auth";

export async function POST(request: Request) {
  const { jwt } = (await request.json().catch(() => ({}))) as { jwt?: unknown };

  if (typeof jwt !== "string" || !jwt) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const isValid = await validateWithLms(jwt);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  await setAuthCookie(jwt);
  return NextResponse.json({ ok: true });
}
