import { prisma } from "@/app/lib/prisma";
import { valueByLabel, type ServiceOption } from "@/app/lib/serviceOptions";

export type ServiceCategory =
  | "QUESTION_STATUS"
  | "QUESTION_DIFFICULTY"
  | "EXAM_STATUS";

// _InternalService only changes when an admin edits it directly in the DB —
// refetching on every request would be wasteful, so each category is cached
// for a short window, same pattern as auth.ts's LMS-validation cache.
const CACHE_TTL_MS = 60_000;
const cache = new Map<
  ServiceCategory,
  { options: ServiceOption[]; fetchedAt: number }
>();

export async function getServiceOptions(
  category: ServiceCategory,
): Promise<ServiceOption[]> {
  const cached = cache.get(category);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS)
    return cached.options;

  const rows = await prisma.internalService.findMany({
    where: { Category: category, IsActive: true },
    orderBy: [{ SortedOrder: "asc" }, { ServiceId: "asc" }],
  });
  // ServiceValue is stored as text (nvarchar) — every category today holds
  // numeric codes, so coerce those to real numbers (Question.Status,
  // MockTest.Status, etc. are Prisma Int columns; comparing a number to the
  // raw string would silently always fail). A future category storing a
  // genuinely non-numeric code is left as a string as-is.
  const options: ServiceOption[] = rows
    .filter((r) => r.ServiceValue !== null && r.ServiceValue !== "")
    .map((r) => {
      const raw = r.ServiceValue as string;
      const numeric = Number(raw);
      return {
        value: Number.isFinite(numeric) ? numeric : raw,
        label: r.ServiceLabel.trim().toUpperCase(),
        displayLabel: r.ServiceDisplayLabel?.trim() ?? r.ServiceLabel.trim(),
        category: r.Category,
        description: r.Description ?? undefined,
      };
    });

  cache.set(category, { options, fetchedAt: Date.now() });
  return options;
}

// Resolves the value for one specific semantic row (e.g. category
// "QUESTION_STATUS", key "APPROVED") — used wherever server-side control
// flow needs "the approved/draft/published value" without hardcoding a
// number. Throws rather than silently guessing if that row is missing or
// deactivated, since callers use this for branches like the ApprovedBy SQL
// stamp or the draft-lock gate, where a wrong guess would be worse than a
// loud failure.
export async function getServiceValue(
  category: ServiceCategory,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type mirrors ServiceOption.value
): Promise<any> {
  const options = await getServiceOptions(category);
  const value = valueByLabel(options, key);
  if (value === undefined) {
    throw new Error(
      `_InternalService is missing an active row for ${category}/${key}`,
    );
  }
  return value;
}
