export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

// Franchise 1 is the master/HQ franchise. Its own content (currently just
// BlueprintTemplate — see app/lib/exams/data.ts and app/lib/exams/actions.ts)
// is reusable by every other franchise, but only franchise 1 itself may edit
// it.
export const MASTER_FRANCHISE_ID = BigInt(1);
