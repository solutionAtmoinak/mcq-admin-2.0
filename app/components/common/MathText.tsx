"use client";

import { memo } from "react";
import { MathJax } from "better-react-mathjax";
import { useDebouncedValue } from "@/app/lib/shared/useDebouncedValue";

const DEFAULT_DEBOUNCE_MS = 400;

function hasLatexDelimiters(text: string): boolean {
  return text.includes("\\(") || text.includes("\\[");
}

// Two content shapes share the same stem / option text / explanation
// columns: text authored here, which is plain with `\( ... \)` LaTeX for
// math, and content migrated from the legacy project, which is an HTML
// fragment (sometimes a whole <body>, sometimes a bare <div>). Which one a
// given value is varies row by row, not call site by call site, so the
// shape is sniffed per value. A bare `<` in plain text can't trip this: a
// tag name has to follow it immediately and the tag has to close. Callers
// that already know pass `html` and skip the sniffing.
function looksLikeHtml(text: string): boolean {
  return /<[a-z][a-z0-9]*\b[^>]*>/i.test(text);
}

// Legacy HTML can carry its math as MathML rather than LaTeX. MathJax
// typesets both, but only for nodes it is handed.
function hasMathML(text: string): boolean {
  return /<math[\s>]/i.test(text);
}

// The HTML branch renders its fragment as-is. Every value reaching this
// component comes from the question bank — authored by staff here, or
// migrated from the legacy bank — which is the same trust level as the
// rest of this UI. Anything student- or visitor-supplied must be
// sanitized at the boundary that accepts it, before it is ever stored.
function HtmlFragment({
  html,
  className,
  inline,
}: {
  html: string;
  className?: string;
  inline: boolean;
}) {
  const Tag = inline ? "span" : "div";
  // Call sites style their box for plain text — typically
  // `whitespace-pre-line`, to keep authored line breaks — and that would
  // otherwise turn every newline in the HTML source into a visible break.
  const classes = className ? `${className} whitespace-normal` : "whitespace-normal";
  return <Tag className={classes} dangerouslySetInnerHTML={{ __html: html }} />;
}

// The ONLY thing that renders the library's <MathJax>, and its own memo
// boundary. better-react-mathjax's <MathJax> retypesets (a real TeX-parse +
// DOM rebuild) on every render of that instance — its internal effect has
// no dependency array, so React only skips re-invoking it when a memoized
// ancestor bails on unchanged props. A debounced value that isn't behind
// its own memo boundary changes nothing, because the component around it
// still re-renders every keystroke either way.
const MathJaxTypeset = memo(function MathJaxTypeset({
  text,
  className,
  inline,
  html,
}: {
  text: string;
  className?: string;
  inline: boolean;
  html: boolean;
}) {
  return (
    <MathJax inline={inline} dynamic className={className}>
      {html ? <HtmlFragment html={text} inline={inline} /> : text}
    </MathJax>
  );
});
MathJaxTypeset.displayName = "MathJaxTypeset";

// Renders `text`, whichever shape it is:
//   - plain text, with any `\( ... \)` / `\[ ... \]` spans — the LaTeX
//     produced by the Word-import OMML converter (see
//     app/lib/questions/wordDocx.ts) — typeset by MathJax;
//   - an HTML fragment from the legacy project, rendered as HTML, with any
//     LaTeX or MathML inside it still typeset.
// Fully self-contained: callers never need to check which shape they have,
// look for math delimiters, or debounce anything themselves, so this drops
// into any page (or another project) as-is.
//
// Needs a `MathJaxContext` ancestor, mounted once in app/layout.tsx.
function MathTextInner({
  text,
  className,
  inline = true,
  html,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: {
  text: string;
  className?: string;
  inline?: boolean;
  // Forces the HTML / plain-text decision instead of sniffing `text`.
  html?: boolean;
  debounceMs?: number;
}) {
  // Debounced BEFORE MathJax ever sees it, so retypesetting for the field
  // currently being typed into only happens once typing pauses — combined
  // with the MathJaxTypeset memo boundary above (debouncing alone doesn't
  // help: this component still re-renders every keystroke either way).
  const debouncedText = useDebouncedValue(text, debounceMs);

  if (!text) return null;

  const isHtml = html ?? looksLikeHtml(text);
  if (!hasLatexDelimiters(text) && !(isHtml && hasMathML(text))) {
    if (isHtml) return <HtmlFragment html={text} className={className} inline={inline} />;
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }
  return (
    <MathJaxTypeset text={debouncedText} className={className} inline={inline} html={isHtml} />
  );
}

// memo() stops sibling instances (other rows/fields whose own `text` prop
// is unchanged) from re-rendering at all — and therefore from ever
// reaching the debounce hook or the typeset boundary above — even though
// their parent re-renders on every keystroke typed elsewhere on the page.
export const MathText = memo(MathTextInner);
MathText.displayName = "MathText";

const DEFAULT_BOX_CLASS =
  "mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-800";

// Wraps MathText in a small preview box, but ONLY when `text` is something
// the raw input/textarea right above it renders badly — math, or legacy
// HTML — and renders nothing (not an empty box) for plain text, which that
// field already shows correctly. Built for the "live preview under an
// editable field" pattern (see QuestionBankEditor.tsx / QuestionEditForm
// .tsx); kept separate from MathText itself so the plain "just show this
// text" use case (list/table cells) never has to think about
// box-or-nothing behavior it doesn't want.
function MathTextPreviewInner({
  text,
  className,
  boxClassName = DEFAULT_BOX_CLASS,
  inline = true,
  html,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: {
  text: string;
  className?: string;
  boxClassName?: string;
  inline?: boolean;
  html?: boolean;
  debounceMs?: number;
}) {
  const isHtml = html ?? looksLikeHtml(text);
  if (!text || (!hasLatexDelimiters(text) && !isHtml)) return null;
  return (
    <div className={boxClassName}>
      <MathText
        text={text}
        className={className}
        inline={inline}
        html={isHtml}
        debounceMs={debounceMs}
      />
    </div>
  );
}

export const MathTextPreview = memo(MathTextPreviewInner);
MathTextPreview.displayName = "MathTextPreview";

// For the dense spots that can't render a fragment at all — a truncated
// table cell, a `title` tooltip — where legacy HTML would otherwise show
// as literal tags. Strips tags, decodes the entities Word-authored content
// actually produces, and collapses whitespace to a single line. The result
// is rendered by React as text, never as HTML.
export function toPlainText(text: string): string {
  if (!looksLikeHtml(text)) return text;
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
