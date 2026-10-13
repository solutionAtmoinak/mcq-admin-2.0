import { callTeacherService } from "@/app/lib/db/teacherService";

// Tag management reads — Modes 40/41 of dbo.spMcqTeacherService (see the SP's
// "Tag management" comment). A TagDimension is the key ("subject"), a Tag is a
// value inside it ("Reasoning") — the same key -> value shape as the question
// editor's tags.

function assertOk<T>(result: T | string | undefined, fallback: string): T {
  if (result === undefined || typeof result === "string") {
    throw new Error(typeof result === "string" ? result : fallback);
  }
  return result;
}

export type TagDimensionListItem = {
  dimensionId: number;
  code: string;
  name: string;
  createdOn: string;
  tagCount: number;
  // Distinct live questions carrying at least one value of this key.
  questionCount: number;
};

type RawDimensionListItem = {
  DimensionId: number;
  Code: string;
  Name: string;
  CreatedOn: string;
  TagCount: number;
  QuestionCount: number;
};

export async function listTagDimensions(q: string): Promise<TagDimensionListItem[]> {
  // An empty list comes back as a null response.
  const rows = assertOk(
    await callTeacherService<RawDimensionListItem[] | null | string>(40, { Q: q }),
    "Failed to load tag keys.",
  );
  return (rows ?? []).map((d) => ({
    dimensionId: d.DimensionId,
    code: d.Code,
    name: d.Name,
    createdOn: d.CreatedOn,
    tagCount: d.TagCount,
    questionCount: d.QuestionCount,
  }));
}

export type TagItem = {
  tagId: string;
  name: string;
  // Distinct live questions carrying this value.
  questionCount: number;
  createdOn: string;
};

export type TagDimensionDetail = {
  dimensionId: number;
  code: string;
  name: string;
  tags: TagItem[];
};

type RawDimensionDetail = {
  DimensionId: number;
  Code: string;
  Name: string;
  Tags: { TagId: string; Name: string; QuestionCount: number; CreatedOn: string }[] | null;
} | null;

export async function getTagDimension(dimensionId: number): Promise<TagDimensionDetail | null> {
  const d = assertOk(
    await callTeacherService<RawDimensionDetail | string>(41, { DimensionId: dimensionId }),
    "Failed to load tag key.",
  );
  if (!d) return null;
  return {
    dimensionId: d.DimensionId,
    code: d.Code,
    name: d.Name,
    tags: (d.Tags ?? []).map((t) => ({
      tagId: t.TagId,
      name: t.Name,
      questionCount: t.QuestionCount,
      createdOn: t.CreatedOn,
    })),
  };
}
