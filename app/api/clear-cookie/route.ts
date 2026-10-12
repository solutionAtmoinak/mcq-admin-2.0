import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Clears the auth cookie, then sends the browser on to /login. Reached by a
// redirect from executor.ts's 401 handler when the cookie couldn't be cleared
// in place (read-only cookies while a Server Component renders) — a Route
// Handler is allowed to modify cookies.
export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete("dth_token");
  return NextResponse.redirect(new URL("/login", request.url));
}
