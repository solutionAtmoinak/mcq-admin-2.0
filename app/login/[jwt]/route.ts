import { NextResponse } from "next/server";
import { setAuthCookie, validateWithLms } from "@/app/lib/auth/auth";

export async function GET(
  request: Request,
  { params }: RouteContext<"/login/[jwt]">,
) {
  const { jwt } = await params;

  const isValid = await validateWithLms(jwt);

  if (isValid) {
    await setAuthCookie(jwt);
    return NextResponse.redirect(new URL("/", request.url));
  } else {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
