"use server";

import { jwtDecode } from "jwt-decode";
import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { UserModel } from "../../interface/UserModel";

const AUTH_COOKIE = "dth_token";

// JWT payload isn't verified here — we only read `exp` so the cookie's own
// lifetime matches the token's, without needing the signing secret.
function getTokenExpiry(token: string): Date | undefined {
  try {
    const payload = token.split(".")[1];
    const { exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      exp?: number;
    };
    return exp ? new Date(exp * 1000) : undefined;
  } catch {
    return undefined;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: getTokenExpiry(token),
  });
}

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE)?.value;
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}

export async function getUser(): Promise<UserModel | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (token) {
    const user = jwtDecode(token);
    return user;
  } else {
    return null;
  }
}

export interface CurrentUser {
  id: string;
  franchiseId: bigint | null;
}

export async function validateWithLms(token: string): Promise<boolean> {
  const uri = process.env.API_ENDPOINT_URL + "/auth/authentication";
  const res = await fetch(uri, {
    method: "POST",
    headers: {
      accept: "text/plain",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  return res.ok;
}

// Call this first thing in every SP-backed Server Function/Route Handler.
// Only checks that the JWT cookie is present and redirects to /login if not
// — it does NOT re-validate the token against the LMS. The stored-procedure
// API itself returns 401 for an invalid/expired token, and
// db/teacherService.ts's callTeacherService() catches that and redirects to
// /login from there instead, so there's no need to pre-flight-check
// validity on every request the way the old Prisma-backed cache did.
export async function requireAuth(): Promise<string> {
  const token = await getAuthCookie();
  if (!token) {
    redirect("/login", RedirectType.replace);
  }

  return token;
}

// Call this instead of requireAuth() in every SP-backed Server Function that
// writes data — it validates the session AND resolves the acting user's
// id/franchise from the same cookie, so CreatedBy/ModifiedBy/FranchiseId are
// always the real signed-in user, never a hardcoded id.
export async function requireUser(): Promise<CurrentUser> {
  await requireAuth();

  const user = await getUser();
  if (!user?.nameid) {
    redirect("/login", RedirectType.replace);
  }

  const franchiseId =
    user.FranchiseId !== undefined &&
    user.FranchiseId !== null &&
    user.FranchiseId !== ""
      ? BigInt(user.FranchiseId)
      : null;

  return { id: user.nameid, franchiseId };
}
