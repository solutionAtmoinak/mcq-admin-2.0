"use server";

import { clearAuthCookie, requireAuth } from "@/app/lib/auth/auth";
import { console } from "inspector";
import { redirect, RedirectType } from "next/navigation";

// Generic caller for any stored procedure reached through the .NET backend's
// generic executor — never a direct DB connection from this app. Shared by
// teacherService.ts's callTeacherService (spMcqTeacherService) and
// migrationService.ts's callMigrationService (spMcqMigrationService); both
// live in the same database (DBDTHMCQPRO) behind the same connection index,
// so only the SP name in the URL path differs. Mirrors
// student-portal/app/lib/db/studentService.ts's callStudentService (same
// {isSuccess, errorMessages, statusCode, result} HTTP envelope, same
// {ID, statuscode, response}/double-JSON-encoded @output unwrapping) — see
// that file's header comment for the full reasoning behind parseUntilObject.
const SERVICE_BASE_URL = `${process.env.API_ENDPOINT_URL}/AuthDataGet/DExecuteJson/8`;

type HttpEnvelope = {
  isSuccess: boolean;
  errorMessages?: string[];
  statusCode: number;
  result?: unknown;
};

type SpEnvelope = { statuscode: unknown; response: unknown };

function isSpEnvelope(value: unknown): value is SpEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "response" in value &&
    "statuscode" in value
  );
}

function parseUntilObject<T>(value: unknown): T {
  let current: unknown = value;
  for (let i = 0; i < 6; i++) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return current as T;
      }
    }
    if (isSpEnvelope(current)) {
      current = current.response;
      continue;
    }
    break;
  }
  return current as T;
}

// Call this instead of a Prisma query in every Server Function/Route Handler
// that used to be Prisma-backed. requireAuth() only checks that the JWT
// cookie is present (see auth.ts) — there's no LMS pre-flight validation
// anymore, so an actually-invalid/expired token is only ever caught here,
// via a 401 from the API itself. On a 401 the stale cookie is cleared and
// the caller is bounced to /login, same destination an absent cookie would
// hit in requireAuth().
export async function callStoredProcedure<T>(
  spName: string,
  mode: number,
  params?: Record<string, unknown>,
): Promise<T | undefined> {
  const token = await requireAuth();

  const res = await fetch(`${SERVICE_BASE_URL}/${spName}/${mode}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(params ?? {}),
  });

  if (res.status === 401) {
    await clearAuthCookie();
    redirect("/login", RedirectType.replace);
  }

  const rawText = await res.text();
  let body: HttpEnvelope | null = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = null;
  }

  // console.log({ rawText, status: res.status, body });
  // A non-2xx status or isSuccess:false doesn't necessarily mean the call
  // itself failed — the SP's own non-200 @output (e.g. "Exam not found.")
  // surfaces this way too, as meaningful business data rather than an
  // infrastructure error — see parseUntilObject/studentService.ts's header
  // for the same contract. Only a genuinely message-less failure throws.
  if (body?.isSuccess === false || body?.errorMessages?.length) {
    const { errorMessages } = body;
    let msgText = "";
    if (errorMessages && errorMessages.length > 0) {
      msgText = errorMessages.join("<br/> ");
    } else {
      msgText =
        errorMessages?.[0] ??
        `Stored procedure call failed, ${spName}/${mode} `;
    }
    return msgText as T;
  }

  if (!body || body.result === undefined || body.result === null) {
    return undefined;
  }

  return parseUntilObject<T>(body.result);
}
