export const CURRENT_USER_ID = "6b2a65ec-3c55-405a-a8ca-5676e49d9717";

export const QUESTION_STATUS = {
  DRAFT: 0,
  IN_REVIEW: 1,
  NEEDS_REVISION: 2,
  REJECTED: 3,
  APPROVED: 4,
} as const;

export const QUESTION_STATUS_LABELS: Record<number, string> = {
  0: "Draft",
  1: "In Review",
  2: "Needs Revision",
  3: "Rejected",
  4: "Approved",
};

export const QUESTION_STATUS_BADGE: Record<number, string> = {
  0: "bg-zinc-100 text-zinc-700",
  1: "bg-blue-100 text-blue-700",
  2: "bg-amber-100 text-amber-800",
  3: "bg-red-100 text-red-700",
  4: "bg-emerald-100 text-emerald-700",
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Very Easy",
  2: "Easy",
  3: "Medium",
  4: "Hard",
  5: "Very Hard",
};

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
