// Status values (both the set of valid ones and what counts as "approved",
// "draft", etc.) come from the DB (_InternalService, Category
// "QUESTION_STATUS") at runtime — see app/lib/serviceConfig.ts's
// getServiceOptions/getServiceValue. Nothing here hardcodes which number
// means what.
//
// Badge colors have no DB column to come from, so this one lookup stays a
// fixed presentation-only palette, keyed by whatever numeric value the DB
// currently reports for each status.
export const QUESTION_STATUS_BADGE: Record<number, string> = {
  0: "bg-zinc-100 text-zinc-700",
  1: "bg-blue-100 text-blue-700",
  2: "bg-amber-100 text-amber-800",
  3: "bg-red-100 text-red-700",
  4: "bg-emerald-100 text-emerald-700",
};

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

// Franchise 1 is the master/HQ franchise. Its own content (currently just
// BlueprintTemplate — see examData.ts/examActions.ts) is reusable by every
// other franchise, but only franchise 1 itself may edit it.
export const MASTER_FRANCHISE_ID = BigInt(1);
