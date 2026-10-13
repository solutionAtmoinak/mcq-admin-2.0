"use server";

import { revalidatePath } from "next/cache";
import { callTeacherService } from "@/app/lib/db/teacherService";
import { getTagDimension, type TagDimensionDetail } from "./data";

export type SimpleResult = { ok: true } | { ok: false; error: string };

function errorFrom(result: unknown, fallback: string): string {
  return typeof result === "string" ? result : fallback;
}

function revalidateTagPages(dimensionId?: number) {
  revalidatePath("/tags");
  if (dimensionId !== undefined) revalidatePath(`/tags/${dimensionId}`);
  // The question editor's tag autocomplete is built from the same tables.
  revalidatePath("/questions/new");
}

export type CreateTagPairsResult =
  | { ok: true; dimensionsCreated: number; tagsCreated: number; tagsExisting: number }
  | { ok: false; error: string };

// Mode 44 — the same find-or-create the question editor does on save: a key
// that doesn't exist becomes a new dimension, a value that doesn't exist under
// that key becomes a new tag; anything already there is left alone.
export async function createTagPairs(pairs: { key: string; value: string }[]): Promise<CreateTagPairsResult> {
  const clean = pairs
    .map((p) => ({ Key: p.key.trim(), Value: p.value.trim() }))
    .filter((p) => p.Key && p.Value);
  if (clean.length === 0) return { ok: false, error: "Enter at least one key and value." };
  if (clean.some((p) => p.Key.length > 100)) return { ok: false, error: "A key must be 100 characters or fewer." };
  if (clean.some((p) => p.Value.length > 200)) return { ok: false, error: "A value must be 200 characters or fewer." };

  const result = await callTeacherService<
    { DimensionsCreated: number; TagsCreated: number; TagsExisting: number } | string
  >(44, { Pairs: clean });
  if (typeof result === "string" || !result) {
    return { ok: false, error: errorFrom(result, "Failed to create the tags.") };
  }
  revalidateTagPages();
  return {
    ok: true,
    dimensionsCreated: result.DimensionsCreated,
    tagsCreated: result.TagsCreated,
    tagsExisting: result.TagsExisting,
  };
}

// Mode 42 — rename a key; its code never changes and every value/question stays attached.
export async function renameTagDimension(dimensionId: number, name: string): Promise<SimpleResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Key name is required." };
  if (trimmed.length > 100) return { ok: false, error: "A key must be 100 characters or fewer." };

  const result = await callTeacherService<string>(42, { DimensionId: dimensionId, Name: trimmed });
  if (typeof result === "string" && result !== "OK") return { ok: false, error: result };
  revalidateTagPages(dimensionId);
  return { ok: true };
}

// Mode 43 — rename a value; it stays on all its questions.
export async function renameTag(dimensionId: number, tagId: string, name: string): Promise<SimpleResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Value name is required." };
  if (trimmed.length > 200) return { ok: false, error: "A value must be 200 characters or fewer." };

  const result = await callTeacherService<string>(43, { TagId: tagId, Name: trimmed });
  if (typeof result === "string" && result !== "OK") return { ok: false, error: result };
  revalidateTagPages(dimensionId);
  return { ok: true };
}

export type LoadTagDimensionResult =
  | { ok: true; dimension: TagDimensionDetail }
  | { ok: false; error: string };

// For the "view values" modal on the key list (loaded on click).
export async function loadTagDimension(dimensionId: number): Promise<LoadTagDimensionResult> {
  try {
    const dimension = await getTagDimension(dimensionId);
    if (!dimension) return { ok: false, error: "Key not found." };
    return { ok: true, dimension };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
