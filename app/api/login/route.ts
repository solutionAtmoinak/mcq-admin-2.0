import { UserModel } from "@/app/interface/UserModel";
import {
  clearAuthCookie,
  setAuthCookie,
  validateWithLms,
} from "@/app/lib/auth/auth";
import { jwtDecode } from "jwt-decode";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { jwt } = (await request.json().catch(() => ({}))) as { jwt?: unknown };

  await clearAuthCookie();

  if (typeof jwt !== "string" || !jwt) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  if (jwt.split(".").length !== 3) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const user: UserModel = jwtDecode(jwt);
  if (user?.role?.toLowerCase() === "student") {
    return NextResponse.json(
      { error: "Student token requested." },
      { status: 403 },
    );
  }

  const isValid = await validateWithLms(jwt);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  await setAuthCookie(jwt);
  return NextResponse.json({ ok: true });
}
