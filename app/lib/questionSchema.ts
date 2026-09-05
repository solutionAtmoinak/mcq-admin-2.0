// Shared types and pure helpers for question-bank creation.
// No server-only imports here: this file is used from both the client editor
// and the server action, so it must stay framework/runtime agnostic.

import type { AttachedMedia } from "@/app/lib/media";
import { valueByLabel, type ServiceOption } from "@/app/lib/serviceOptions";

export type QuestionTypeCode = "mcq_single" | "msq" | "integer" | "owa";

export type OptionInput = {
  id: string;
  text: string;
  // Optional image/audio/video attached via the option's media modal — see
  // app/components/OptionMediaModal.tsx. Absent/null means no attachment.
  media?: AttachedMedia | null;
};

// A dynamic tag: `key` is the tag dimension (e.g. "subject", "topic", or any
// new dimension the user types), `value` is the tag name within that
// dimension (e.g. "Reasoning"). Either side is created on the fly if it
// doesn't already exist in the tag bank.
export type TagPair = {
  key: string;
  value: string;
};

export type QuestionInput = {
  code: string;
  typeCode: QuestionTypeCode;
  difficulty: number;
  status: number;
  estSolveSec: number | null;
  stem: string;
  // Optional image/audio/video attached to the question itself (as opposed
  // to a specific option) — see the Media section in
  // QuestionOptionalSettingsModal. Absent/null means no attachment.
  media?: AttachedMedia | null;
  options: OptionInput[];
  correctOptionIds: string[];
  correctValue: string;
  marks: number;
  negativeMarks: number;
  explanation: string;
  tags: TagPair[];
};

export const QUESTION_TYPE_LABELS: Record<QuestionTypeCode, string> = {
  mcq_single: "Single Correct (MCQ)",
  msq: "Multiple Correct (MSQ)",
  integer: "Integer Answer",
  owa: "Fill in the Blank (One Word)",
};

export function isOptionBasedType(type: string): boolean {
  return type === "mcq_single" || type === "msq";
}

const OPTION_LETTERS = "ABCDEFGH";

let clientIdCounter = 0;
export function nextClientId(): string {
  clientIdCounter += 1;
  return `row-${Date.now().toString(36)}-${clientIdCounter}`;
}

// `defaultStatus` is the numeric value to use when `overrides` doesn't
// already include one — callers resolve this from a fetched
// ServiceOption[] (e.g. `valueByLabel(referenceData.questionStatusOptions,
// "APPROVED")`), since this file has no DB access of its own.
export function emptyQuestion(
  overrides: Partial<QuestionInput> = {},
  defaultStatus: number = 0,
): QuestionInput {
  return {
    code: "",
    typeCode: "mcq_single",
    difficulty: 2,
    status: defaultStatus,
    estSolveSec: null,
    stem: "",
    options: [
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ],
    correctOptionIds: [],
    correctValue: "",
    marks: 1,
    negativeMarks: 0,
    explanation: "",
    tags: [{ key: "", value: "" }],
    ...overrides,
  };
}

// `validStatusValues` comes from a fetched ServiceOption[] (e.g.
// `referenceData.questionStatusOptions.map((o) => o.value)`) — this file has
// no DB access of its own, so the caller resolves what counts as valid.
export function validateQuestion(q: QuestionInput, validStatusValues: unknown[]): string | null {
  if (!q.stem.trim()) return "Question text (stem) is required.";
  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
    return "Difficulty must be between 1 and 5.";
  }
  if (!validStatusValues.includes(q.status)) return "Invalid status.";
  if (!Number.isFinite(q.marks) || q.marks <= 0)
    return "Marks must be greater than 0.";
  if (!Number.isFinite(q.negativeMarks) || q.negativeMarks < 0) {
    return "Negative marks cannot be negative.";
  }

  // Tags are optional, but a half-filled pair (key typed with no value, or
  // vice versa) is a data-entry mistake, so that's still caught here.
  for (const t of q.tags) {
    const key = t.key.trim();
    const value = t.value.trim();
    if (key && !value) return `Tag "${key}" needs a value.`;
    if (!key && value)
      return `Tag value "${value}" needs a key (e.g. "subject").`;
  }

  if (isOptionBasedType(q.typeCode)) {
    const cleanOptions = q.options.filter((o) => o.text.trim());
    if (cleanOptions.length < 2)
      return "At least 2 options with text are required.";
    const ids = new Set(q.options.map((o) => o.id));
    if (ids.size !== q.options.length) return "Option ids must be unique.";
    if (q.correctOptionIds.length === 0)
      return "Select at least one correct option.";
    if (q.typeCode === "mcq_single" && q.correctOptionIds.length !== 1) {
      return "Single-correct questions need exactly one correct option.";
    }
    for (const c of q.correctOptionIds) {
      if (!ids.has(c))
        return `Correct option "${c}" was not found among the options.`;
      const opt = q.options.find((o) => o.id === c);
      if (opt && !opt.text.trim()) return `Correct option "${c}" has no text.`;
    }
  } else if (q.typeCode === "owa") {
    // "owa" (one word answer) is a fill-in-the-blank text answer, hence no
    // numeric parsing here.
    const value = q.correctValue.trim();
    if (!value) return "Correct answer is required.";
    if (/\s/.test(value)) return "Answer must be a single word (no spaces).";
  } else {
    if (q.correctValue.trim() === "")
      return "Correct numeric answer is required.";
    const n = Number(q.correctValue);
    if (Number.isNaN(n)) return "Correct answer must be a number.";
    if (!Number.isInteger(n))
      return "Integer-type questions require a whole-number answer.";
  }
  return null;
}

export type BuiltContent = {
  presentation: Record<string, unknown>;
  answer: Record<string, unknown>;
};

export function buildContent(q: QuestionInput): BuiltContent {
  const explanation = q.explanation.trim();
  const questionMedia = q.media ? { media: q.media } : {};

  if (isOptionBasedType(q.typeCode)) {
    const options = q.options
      .filter((o) => o.text.trim())
      .map((o) => ({
        id: o.id,
        text: o.text.trim(),
        ...(o.media ? { media: o.media } : {}),
      }));
    return {
      presentation: { stem: q.stem.trim(), ...questionMedia, options },
      answer: {
        correct: q.correctOptionIds,
        marks: q.marks,
        negative: q.negativeMarks,
        ...(explanation ? { explanation } : {}),
      },
    };
  }

  if (q.typeCode === "owa") {
    return {
      presentation: { stem: q.stem.trim(), ...questionMedia, responseType: "text" },
      answer: {
        correct: q.correctValue.trim(),
        marks: q.marks,
        negative: q.negativeMarks,
        ...(explanation ? { explanation } : {}),
      },
    };
  }

  const n = Number(q.correctValue);
  return {
    presentation: { stem: q.stem.trim(), ...questionMedia, responseType: "integer" },
    answer: {
      correct: n,
      marks: q.marks,
      negative: q.negativeMarks,
      ...(explanation ? { explanation } : {}),
    },
  };
}

export function buildSearchText(q: QuestionInput): string {
  const parts = [
    q.stem,
    ...(isOptionBasedType(q.typeCode) ? q.options.map((o) => o.text) : []),
    ...q.tags.map((t) => t.value),
  ];
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3800);
}

// ---- Reference data (loaded from the DB, passed down to the client) ----
// Used to power autocomplete suggestions for tag keys (dimensions) and
// values (tags within a dimension). Any key/value typed that isn't found
// here is simply created on save.

export type ReferenceDimension = { id: number; code: string; name: string };
export type ReferenceTagOption = { id: string; name: string };

export type ReferenceData = {
  questionTypes: { id: number; code: QuestionTypeCode; name: string }[];
  dimensions: ReferenceDimension[];
  tagsByDimensionId: Record<number, ReferenceTagOption[]>;
  // Status/difficulty dropdown options — sourced from the DB's
  // _InternalService table (see app/lib/serviceConfig.ts) so an admin can
  // rename/reorder/deactivate them without a code change.
  questionStatusOptions: ServiceOption[];
  difficultyOptions: ServiceOption[];
};

// ---- JSON bulk-import ----
// Accepts a friendly, human/AI-authored shape. Tag keys/values are taken
// as-is (no lookup needed here) — unknown ones are created automatically
// when the batch is saved.

export type ImportResult = {
  rows: QuestionInput[];
  warnings: string[];
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function normalizeStatusKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// `statusOptions` comes from a fetched ServiceOption[] — pasted JSON can
// name a status either by its machine key ("IN_REVIEW") or its current
// display text ("In Review"), matched case/punctuation-insensitively
// against both.
export function parseImportJson(
  text: string,
  statusOptions: ServiceOption[],
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("JSON must be an array of question objects.");
  }

  const warnings: string[] = [];
  const validTypes = new Set<string>(["mcq_single", "msq", "integer", "owa"]);
  const validStatusValues = statusOptions.map((o) => o.value);
  const statusKeyLookup = new Map<string, number | string>();
  for (const o of statusOptions) {
    statusKeyLookup.set(normalizeStatusKey(o.category), o.value);
    statusKeyLookup.set(normalizeStatusKey(o.label), o.value);
  }
  const defaultStatus =
    valueByLabel(statusOptions, "APPROVED") ?? statusOptions[0]?.value ?? 0;

  const rows: QuestionInput[] = parsed.map((raw, idx) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const rowNo = idx + 1;

    let typeCode = asString(r.type) ?? "mcq_single";
    if (!validTypes.has(typeCode)) {
      warnings.push(
        `Row ${rowNo}: unknown type "${typeCode}", defaulting to mcq_single.`,
      );
      typeCode = "mcq_single";
    }

    let status = defaultStatus;
    const rawStatus = r.status;
    if (
      typeof rawStatus === "number" &&
      validStatusValues.includes(rawStatus)
    ) {
      status = rawStatus;
    } else if (typeof rawStatus === "string") {
      const matched = statusKeyLookup.get(normalizeStatusKey(rawStatus));
      if (matched !== undefined) status = matched;
      else
        warnings.push(
          `Row ${rowNo}: unknown status "${rawStatus}", defaulting to Approved.`,
        );
    }

    const rawTags = Array.isArray(r.tags) ? r.tags : [];
    const tags: TagPair[] = rawTags
      .map((t) => {
        const tag = (t ?? {}) as Record<string, unknown>;
        return {
          key: asString(tag.key) ?? "",
          value: asString(tag.value) ?? "",
        };
      })
      .filter((t) => t.key.trim() && t.value.trim());
    if (tags.length === 0) {
      tags.push({ key: "", value: "" });
    }

    const base = emptyQuestion({
      typeCode: typeCode as QuestionTypeCode,
      difficulty: asNumber(r.difficulty) ?? 2,
      status,
      estSolveSec: asNumber(r.estSolveSec) ?? null,
      stem: asString(r.stem) ?? "",
      marks: asNumber(r.marks) ?? 1,
      negativeMarks: asNumber(r.negativeMarks) ?? 0,
      explanation: asString(r.explanation) ?? "",
      code: asString(r.code) ?? "",
      tags,
    });

    if (isOptionBasedType(base.typeCode)) {
      const rawOptions = Array.isArray(r.options) ? r.options : [];
      base.options = rawOptions.map((o, i) => {
        const opt = (o ?? {}) as Record<string, unknown>;
        return {
          id: asString(opt.id) || OPTION_LETTERS[i] || String(i + 1),
          text: asString(opt.text) ?? "",
        };
      });
      if (base.options.length === 0) {
        warnings.push(`Row ${rowNo}: no options provided.`);
      }
      const correctRaw = r.correct;
      if (Array.isArray(correctRaw)) {
        base.correctOptionIds = correctRaw.map(String);
      } else if (correctRaw != null) {
        base.correctOptionIds = [String(correctRaw)];
      }
    } else {
      const correctRaw = r.correct;
      base.correctValue = correctRaw != null ? String(correctRaw) : "";
    }

    return base;
  });

  return { rows, warnings };
}

export const IMPORT_JSON_EXAMPLE = `[
  {
    "type": "mcq_single",
    "difficulty": 2,
    "status": "Draft",
    "stem": "A number is increased by 20% and then decreased by 20%. What is the net change?",
    "options": [
      { "id": "A", "text": "No change" },
      { "id": "B", "text": "4% decrease" },
      { "id": "C", "text": "4% increase" },
      { "id": "D", "text": "8% decrease" }
    ],
    "correct": ["B"],
    "marks": 4,
    "negativeMarks": 1,
    "explanation": "Let the number be 100. It becomes 120 and then 96.",
    "tags": [
      { "key": "subject", "value": "Quantitative Reasoning" },
      { "key": "topic", "value": "Percent Change" },
      { "key": "skill", "value": "Conceptual" }
    ]
  },
  {
    "type": "integer",
    "stem": "Find the next number in the series: 2, 6, 12, 20, 30, ?",
    "correct": 42,
    "tags": [
      { "key": "subject", "value": "Logical Reasoning" },
      { "key": "topic", "value": "Number Series" }
    ]
  }
]`;
