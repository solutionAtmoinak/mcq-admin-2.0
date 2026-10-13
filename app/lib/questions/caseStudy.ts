// Shared types and pure helpers for case studies (one paragraph, many
// questions). No server-only imports: used by the client editors, the import
// parsers in schema.ts and the server actions, same rule as schema.ts.
//
// A case study is a paragraph (plain text, HTML, or LaTeX written as
// \( ... \)) shared by several questions of kind "case_study". Storage:
// dbo.QuestionGroup (+ Code/Title/SearchText) and
// dbo.QuestionGroupVersion.ContextJson — see
// mcq-admin/sql/add-questiongroup-case-study-columns.sql. A question joins a
// case study through Question.GroupId / GroupSeq. Editing a case study's text
// creates a new QuestionGroupVersion (never mutates one), same as questions.

export const CASE_STUDY_TITLE_MAX = 200;
// QuestionGroup.SearchText is NVARCHAR(4000); stay under it, same margin as
// buildSearchText() for questions.
const CASE_STUDY_SEARCH_MAX = 3800;

// The case study a question points at, as the editors hold it. `groupId` is
// null only for one that came from a bulk import and has not been saved yet —
// it is created when the first question using it is saved.
export type CaseStudyRef = {
  groupId: string | null;
  code: string | null;
  title: string;
  text: string;
};

// What the importers (Word / JSON) produce: `key` ties it to the rows (by
// index into ImportResult.rowCaseStudyKeys).
export type ImportedCaseStudy = { key: string; title: string; text: string };

// The title is what people pick a case study by (drawer list, header button),
// so it is required.
export function validateCaseStudy(c: Pick<CaseStudyRef, "title" | "text">): string | null {
  if (!c.title.trim()) return "Case study title is required — it is how you find this case study later.";
  if (!c.text.trim()) return "Case study paragraph is required.";
  if (c.title.trim().length > CASE_STUDY_TITLE_MAX) {
    return `Case study title must be ${CASE_STUDY_TITLE_MAX} characters or fewer.`;
  }
  return null;
}

// ContextJson for a version — the paragraph itself.
export function buildCaseStudyContext(c: Pick<CaseStudyRef, "title" | "text">): Record<string, unknown> {
  return { title: c.title.trim(), text: c.text.trim() };
}

// Searchable text: tags stripped so HTML markup doesn't pollute the picker's
// LIKE search or its preview.
export function buildCaseStudySearchText(c: Pick<CaseStudyRef, "title" | "text">): string {
  return [c.title, c.text.replace(/<[^>]*>/g, " ")]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CASE_STUDY_SEARCH_MAX);
}

// Title for a case study that arrived without one (bulk import): the opening of
// its paragraph, tags stripped. Editable afterwards via "Edit paragraph".
export function defaultCaseStudyTitle(text: string, max = 60): string {
  const flat = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

// Short human label: the title when there is one, otherwise the opening of
// the paragraph.
export function caseStudyLabel(c: Pick<CaseStudyRef, "title" | "text" | "code">, max = 60): string {
  const title = c.title.trim();
  if (title) return title;
  const flat = c.text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (flat) return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  return c.code ?? "Untitled case study";
}

// True when the paragraph looks like HTML — decides whether the preview keeps
// plain-text line breaks (it must not for HTML, where the markup does that).
export function looksLikeHtmlText(text: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(text);
}
