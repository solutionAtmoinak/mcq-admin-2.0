// Shared types and pure helpers for question-bank creation.
// No server-only imports here: this file is used from both the client editor
// and the server action, so it must stay framework/runtime agnostic.

import type { AttachedMedia } from "@/app/lib/auth/media";
import { valueByLabel, type ServiceOption } from "@/app/lib/db/serviceOptions";

export type QuestionTypeCode = "mcq_single" | "msq" | "integer" | "owa";

export type OptionInput = {
  id: string;
  text: string;
  // Optional image/audio/video attached via the option's media modal — see
  // app/components/questions/OptionMediaModal.tsx. Absent/null means no attachment.
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
  // _InternalService table (see app/lib/db/serviceConfig.ts) so an admin can
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

// ---- Excel bulk-import ----
// Mirrors parseImportJson's shape/behavior but reads a flat spreadsheet
// instead of nested JSON. Columns are positional and MUST appear in exactly
// this order: "Question", 2 to 10 "Option ..." columns, "Correct",
// "Explanation", "Tag Key", "Tag Value", "Difficulty", "Status" — rather
// than matched by name anywhere in the sheet, so a shuffled sheet is
// rejected with a clear error instead of silently misreading columns.
//
// This project has no fixed "Subject"/"Chapter" concept — only the generic
// Tag/TagDimension model (see DATA_FLOW.md §4) — so `Tag Key`/`Tag Value`
// carry that as-is: whatever the user types in `Tag Key` becomes a tag's
// dimension, whatever they type in `Tag Value` becomes the tag itself
// within it. A question can carry several tags: both cells take a
// comma-separated list, paired up positionally (1st key with 1st value, 2nd
// with 2nd, ...) — e.g. Tag Key "chapter,skill" + Tag Value "Percent
// Change,Conceptual" creates two tags. No catalog validation happens here —
// like every other tag in this app, it's resolveTagIds
// (app/lib/questions/actions.ts) that matches an existing Tag by key+value
// or creates one on save. No Marks/Code columns: every imported question
// gets the same default marks (1/0) and an auto-generated code, same as a
// manually-typed row left at its defaults.
export const IMPORT_EXCEL_HEADERS = [
  "Question",
  "Option A",
  "Option B",
  "Option C",
  "Option D",
  "Correct",
  "Explanation",
  "Tag Key",
  "Tag Value",
  "Difficulty",
  "Status",
];

export const IMPORT_EXCEL_EXAMPLE_ROWS: (string | number)[][] = [
  IMPORT_EXCEL_HEADERS,
  [
    "A number is increased by 20% and then decreased by 20%. What is the net change?",
    "No change",
    "4% decrease",
    "4% increase",
    "8% decrease",
    "B",
    "Let the number be 100. It becomes 120 and then 96.",
    "chapter,skill",
    "Percent Change,Conceptual",
    2,
    "Draft",
  ],
  [
    "Which planet is known as the Red Planet?",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "B",
    "",
    "chapter",
    "Astronomy",
    1,
    "Approved",
  ],
];

const OPTION_HEADER_RE = /^Option\s+([A-Za-z0-9]+)$/i;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
// Everything after the variable-length run of "Option ..." columns, in the
// exact order it must appear.
const REQUIRED_TAIL_HEADERS = ["Correct", "Explanation", "Tag Key", "Tag Value", "Difficulty", "Status"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function orderErrorMessage(): string {
  return (
    `Columns must appear in exactly this order: "Question", ${MIN_OPTIONS} to ${MAX_OPTIONS} option ` +
    `columns (e.g. "Option A", "Option B", ... or "Option 1", "Option 2", ...), then "` +
    `${REQUIRED_TAIL_HEADERS.join('", "')}". Download the sample file to check the exact layout.`
  );
}

// `headerRow`/`dataRows` are the raw array-of-arrays shape XLSX.utils
// .sheet_to_json(sheet, { header: 1 }) produces (header row separate from
// data rows) — positional, not keyed by header name, since column order is
// enforced below rather than columns being found by name.
export function parseImportExcelRows(
  headerRow: unknown[],
  dataRows: unknown[][],
  statusOptions: ServiceOption[],
): ImportResult {
  const headers = headerRow.map((h) => String(h ?? "").trim());
  while (headers.length > 0 && headers[headers.length - 1] === "") {
    headers.pop(); // trailing blank cells are a common spreadsheet-export artifact, not a real column
  }
  if (headers.length === 0) {
    throw new Error("No columns found in the sheet — check the sample file.");
  }
  if (normalizeHeader(headers[0]) !== "question") {
    throw new Error(orderErrorMessage());
  }

  let pos = 1;
  const optionIds: string[] = [];
  while (pos < headers.length && OPTION_HEADER_RE.test(headers[pos])) {
    optionIds.push(headers[pos].match(OPTION_HEADER_RE)![1].toUpperCase());
    pos += 1;
  }
  if (optionIds.length < MIN_OPTIONS || optionIds.length > MAX_OPTIONS) {
    throw new Error(
      `Found ${optionIds.length} option column(s) right after "Question" — need ${MIN_OPTIONS} to ${MAX_OPTIONS}, named like "Option A", "Option B" or "Option 1", "Option 2".`,
    );
  }
  const optionStartPos = 1;

  for (const expected of REQUIRED_TAIL_HEADERS) {
    if (normalizeHeader(headers[pos] ?? "") !== normalizeHeader(expected)) {
      throw new Error(orderErrorMessage());
    }
    pos += 1;
  }
  if (pos !== headers.length) {
    throw new Error(orderErrorMessage());
  }
  const [correctPos, explanationPos, tagKeyPos, tagValuePos, difficultyPos, statusPos] =
    REQUIRED_TAIL_HEADERS.map((_, i) => optionStartPos + optionIds.length + i);

  function at(row: unknown[], idx: number): string {
    const v = row[idx];
    return v == null ? "" : String(v).trim();
  }

  const warnings: string[] = [];
  const validStatusValues = statusOptions.map((o) => o.value);
  const statusKeyLookup = new Map<string, number | string>();
  for (const o of statusOptions) {
    statusKeyLookup.set(normalizeStatusKey(o.category), o.value);
    statusKeyLookup.set(normalizeStatusKey(o.label), o.value);
  }
  const defaultStatus =
    valueByLabel(statusOptions, "APPROVED") ?? statusOptions[0]?.value ?? 0;

  const parsedRows: QuestionInput[] = [];

  dataRows.forEach((row, idx) => {
    const rowNo = idx + 2; // header occupies row 1
    const stem = at(row, 0);
    if (!stem) {
      warnings.push(`Row ${rowNo}: skipped — Question is empty.`);
      return;
    }
    const correctRaw = at(row, correctPos);
    if (!correctRaw) {
      warnings.push(`Row ${rowNo}: skipped — Correct is empty.`);
      return;
    }
    const correctOptionIds = correctRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const options: OptionInput[] = optionIds
      .map((id, i) => ({ id, text: at(row, optionStartPos + i) }))
      .filter((o) => o.text !== "");
    if (options.length < MIN_OPTIONS) {
      warnings.push(`Row ${rowNo}: skipped — needs at least ${MIN_OPTIONS} non-empty options.`);
      return;
    }
    const presentOptionIds = new Set(options.map((o) => o.id));
    const missingCorrect = correctOptionIds.filter((id) => !presentOptionIds.has(id));
    if (missingCorrect.length) {
      warnings.push(
        `Row ${rowNo}: skipped — Correct references option(s) not present: ${missingCorrect.join(", ")}.`,
      );
      return;
    }

    // Multiple tags per question: "Tag Key" and "Tag Value" each hold a
    // comma-separated list, paired up positionally (see file-header comment
    // above). Uneven lists pair as many as line up; the rest are dropped
    // with a warning rather than guessing a pairing.
    const tagKeys = at(row, tagKeyPos).split(",").map((s) => s.trim()).filter(Boolean);
    const tagValues = at(row, tagValuePos).split(",").map((s) => s.trim()).filter(Boolean);
    const pairCount = Math.min(tagKeys.length, tagValues.length);
    const tags: TagPair[] = [];
    for (let t = 0; t < pairCount; t++) {
      tags.push({ key: tagKeys[t], value: tagValues[t] });
    }
    if (tagKeys.length !== tagValues.length) {
      warnings.push(
        `Row ${rowNo}: "Tag Key" has ${tagKeys.length} entr${tagKeys.length === 1 ? "y" : "ies"} but "Tag Value" has ${tagValues.length} — only the first ${pairCount} were paired, the rest ignored.`,
      );
    }
    if (tags.length === 0) tags.push({ key: "", value: "" });

    let status = defaultStatus;
    const statusRaw = at(row, statusPos);
    if (statusRaw) {
      const asNum = Number(statusRaw);
      if (!Number.isNaN(asNum) && validStatusValues.includes(asNum)) {
        status = asNum;
      } else {
        const matched = statusKeyLookup.get(normalizeStatusKey(statusRaw));
        if (matched !== undefined) status = matched;
        else warnings.push(`Row ${rowNo}: unknown status "${statusRaw}", defaulting to Approved.`);
      }
    }

    const difficultyRaw = at(row, difficultyPos);
    const difficulty = difficultyRaw ? Number(difficultyRaw) : 2;

    parsedRows.push(
      emptyQuestion({
        typeCode: correctOptionIds.length > 1 ? "msq" : "mcq_single",
        difficulty: Number.isFinite(difficulty) ? difficulty : 2,
        status,
        stem,
        options,
        correctOptionIds,
        explanation: at(row, explanationPos),
        tags,
      }),
    );
  });

  if (parsedRows.length === 0 && warnings.length === 0) {
    warnings.push("No data rows found in the sheet.");
  }

  return { rows: parsedRows, warnings };
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
