// Browser-safe (and Node-safe) .docx -> plain-lines extractor for the Word
// bulk-import path (see QuestionBankEditor.tsx's "From Word (.docx)"
// section). Mirrors the role XLSX.read() plays for the Excel import: this
// file does the file-format-specific extraction, while
// app/lib/questions/schema.ts's parseImportWordLines() does the generic
// "lines -> QuestionInput[]" shaping, same as parseImportExcelRows().
//
// A .docx is a zip; the paragraphs live in word/document.xml as OOXML
// WordprocessingML, with any Word-native equations (Insert > Equation)
// embedded inline as OMML (<m:oMath>...</m:oMath>) — NOT MathML. There is no
// npm package that converts OMML -> LaTeX, so this file walks the OMML tree
// directly and emits LaTeX itself, wrapped in `\( ... \)` so it can be
// embedded straight into the plain `stem` / option text / `explanation`
// strings QuestionInput already uses (see MathText.tsx for the render side).
//
// Only the common exam-question constructs are covered (fractions,
// sub/superscripts, radicals, sums/integrals/products with limits,
// delimiters, named functions, limits). Anything not explicitly handled
// falls through to a generic "recurse and concatenate" default rather than
// being dropped, so unsupported constructs degrade to plain text instead of
// vanishing or crashing.

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

type OrderedNode = { [tag: string]: unknown } & { ":@"?: Record<string, unknown> };

function tagName(node: OrderedNode): string | null {
  for (const k of Object.keys(node)) {
    if (k !== ":@") return k;
  }
  return null;
}

function children(node: OrderedNode): OrderedNode[] {
  const tag = tagName(node);
  if (!tag) return [];
  const v = node[tag];
  return Array.isArray(v) ? (v as OrderedNode[]) : [];
}

function isText(node: OrderedNode): boolean {
  return tagName(node) === "#text";
}

function textValue(node: OrderedNode): string {
  return String(node["#text"] ?? "");
}

function attr(node: OrderedNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  const a = node[":@"];
  if (!a) return undefined;
  const v = (a as Record<string, unknown>)[`@_${name}`];
  return v === undefined ? undefined : String(v);
}

function findFirst(nodes: OrderedNode[], tag: string): OrderedNode | undefined {
  return nodes.find((n) => tagName(n) === tag);
}

function findAll(nodes: OrderedNode[], tag: string): OrderedNode[] {
  return nodes.filter((n) => tagName(n) === tag);
}

// ---- LaTeX text helpers ----

// A handful of ASCII characters that are LaTeX-fragile if they slip into a
// math span verbatim (Word's equation editor never types these as literal
// text; if it did, this keeps them from breaking the surrounding \( \)).
function escapeLatexSpecials(s: string): string {
  return s.replace(/([%#&])/g, "\\$1");
}

// Every replacement is brace-wrapped ("{\\pi}" not "\\pi") so a following
// letter can never merge into the command name (bare "\\pi" immediately
// followed by "x" would parse as the undefined control word "\pix").
const MATH_SYMBOL_MAP: Record<string, string> = {
  "→": "{\\to}", "⇒": "{\\Rightarrow}", "⇔": "{\\Leftrightarrow}", "←": "{\\leftarrow}",
  "∞": "{\\infty}", "≈": "{\\approx}", "≠": "{\\ne}", "≤": "{\\le}", "≥": "{\\ge}",
  "±": "{\\pm}", "∓": "{\\mp}", "×": "{\\times}", "÷": "{\\div}", "·": "{\\cdot}",
  "−": "-", "∂": "{\\partial}", "∇": "{\\nabla}", "∴": "{\\therefore}", "∵": "{\\because}",
  "∀": "{\\forall}", "∃": "{\\exists}", "∈": "{\\in}", "∉": "{\\notin}",
  "⊂": "{\\subset}", "⊆": "{\\subseteq}", "∪": "{\\cup}", "∩": "{\\cap}",
  "∅": "{\\emptyset}", "≡": "{\\equiv}", "∝": "{\\propto}", "…": "{\\ldots}", "⋯": "{\\cdots}",
  "π": "{\\pi}", "θ": "{\\theta}", "α": "{\\alpha}", "β": "{\\beta}", "γ": "{\\gamma}",
  "δ": "{\\delta}", "Δ": "{\\Delta}", "λ": "{\\lambda}", "μ": "{\\mu}", "σ": "{\\sigma}",
  "Σ": "{\\Sigma}", "φ": "{\\phi}", "ω": "{\\omega}", "Ω": "{\\Omega}",
  "°": "^{\\circ}",
};
const MATH_SYMBOL_RE = new RegExp(Object.keys(MATH_SYMBOL_MAP).join("|"), "g");

function mapMathText(s: string): string {
  return escapeLatexSpecials(s).replace(MATH_SYMBOL_RE, (ch) => MATH_SYMBOL_MAP[ch] ?? ch);
}

const NARY_SYMBOL_MAP: Record<string, string> = {
  "∑": "\\sum", "∏": "\\prod", "∐": "\\coprod",
  "∫": "\\int", "∬": "\\iint", "∭": "\\iiint",
  "∮": "\\oint", "∯": "\\oiint", "∰": "\\oiiint",
  "⋃": "\\bigcup", "⋂": "\\bigcap", "⋁": "\\bigvee", "⋀": "\\bigwedge",
  "⨁": "\\bigoplus", "⨂": "\\bigotimes",
};

const KNOWN_FUNCS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "sinh", "cosh", "tanh", "coth",
  "arcsin", "arccos", "arctan",
  "log", "ln", "exp", "lim", "max", "min", "gcd", "det", "dim", "arg", "deg",
  "hom", "ker", "inf", "sup", "liminf", "limsup",
]);

const DELIM_LATEX_MAP: Record<string, string> = {
  "(": "(", ")": ")", "[": "[", "]": "]",
  "{": "\\{", "}": "\\}", "|": "|", "‖": "\\|",
  "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil", "⌉": "\\rceil",
  "<": "\\langle", ">": "\\rangle",
};

function delimLatex(ch: string | undefined, fallback: string): string {
  if (ch === undefined) return DELIM_LATEX_MAP[fallback] ?? fallback;
  if (ch === "") return "."; // explicitly no visible delimiter
  return DELIM_LATEX_MAP[ch] ?? ".";
}

function childrenLatex(node: OrderedNode | undefined): string {
  return node ? seqToLatex(children(node)) : "";
}

function seqToLatex(nodes: OrderedNode[]): string {
  return nodes.map(nodeToLatex).join("");
}

// Recursive OMML -> LaTeX conversion. Covers the constructs Word's built-in
// equation gallery actually produces for exam-style math; anything else
// falls through to the default case, which still recurses into children so
// text isn't silently lost even for unhandled wrapper elements.
function nodeToLatex(node: OrderedNode): string {
  const tag = tagName(node);
  if (!tag) return "";
  if (tag === "#text") return mapMathText(textValue(node));
  // Every OMML/WordprocessingML "properties" element ends in "Pr" (m:rPr,
  // m:fPr, m:naryPr, m:dPr, ...) and carries formatting, not content.
  if (/Pr$/.test(tag)) return "";

  const kids = children(node);

  switch (tag) {
    case "m:f": {
      const num = findFirst(kids, "m:num");
      const den = findFirst(kids, "m:den");
      return `\\frac{${childrenLatex(num)}}{${childrenLatex(den)}}`;
    }
    case "m:sSub": {
      const e = findFirst(kids, "m:e");
      const sub = findFirst(kids, "m:sub");
      return `{${childrenLatex(e)}}_{${childrenLatex(sub)}}`;
    }
    case "m:sSup": {
      const e = findFirst(kids, "m:e");
      const sup = findFirst(kids, "m:sup");
      return `{${childrenLatex(e)}}^{${childrenLatex(sup)}}`;
    }
    case "m:sSubSup": {
      const e = findFirst(kids, "m:e");
      const sub = findFirst(kids, "m:sub");
      const sup = findFirst(kids, "m:sup");
      return `{${childrenLatex(e)}}_{${childrenLatex(sub)}}^{${childrenLatex(sup)}}`;
    }
    case "m:sPre": {
      const e = findFirst(kids, "m:e");
      const sub = findFirst(kids, "m:sub");
      const sup = findFirst(kids, "m:sup");
      return `{}_{${childrenLatex(sub)}}^{${childrenLatex(sup)}}{${childrenLatex(e)}}`;
    }
    case "m:rad": {
      const deg = childrenLatex(findFirst(kids, "m:deg")).trim();
      const e = findFirst(kids, "m:e");
      return deg ? `\\sqrt[${deg}]{${childrenLatex(e)}}` : `\\sqrt{${childrenLatex(e)}}`;
    }
    case "m:nary": {
      const naryPr = findFirst(kids, "m:naryPr");
      const chrNode = naryPr && findFirst(children(naryPr), "m:chr");
      const sym = (chrNode && attr(chrNode, "m:val")) || "∑";
      const cmd = NARY_SYMBOL_MAP[sym] ?? sym;
      const sub = findFirst(kids, "m:sub");
      const sup = findFirst(kids, "m:sup");
      const e = findFirst(kids, "m:e");
      let out = cmd;
      if (sub) out += `_{${childrenLatex(sub)}}`;
      if (sup) out += `^{${childrenLatex(sup)}}`;
      return `${out}{${childrenLatex(e)}}`;
    }
    case "m:d": {
      const dPr = findFirst(kids, "m:dPr");
      const begChr = dPr && attr(findFirst(children(dPr), "m:begChr"), "m:val");
      const endChr = dPr && attr(findFirst(children(dPr), "m:endChr"), "m:val");
      const inner = findAll(kids, "m:e").map(childrenLatex).join(", ");
      if (begChr === "" && endChr === "") return inner; // grouping only, no visible delimiter
      return `\\left${delimLatex(begChr, "(")} ${inner} \\right${delimLatex(endChr, ")")}`;
    }
    case "m:func": {
      const fName = findFirst(kids, "m:fName");
      const e = findFirst(kids, "m:e");
      return `${funcNameLatex(fName)}{${childrenLatex(e)}}`;
    }
    case "m:limLow": {
      const e = findFirst(kids, "m:e");
      const lim = findFirst(kids, "m:lim");
      return `${limBaseLatex(e)}_{${childrenLatex(lim)}}`;
    }
    case "m:limUpp": {
      const e = findFirst(kids, "m:e");
      const lim = findFirst(kids, "m:lim");
      return `${limBaseLatex(e)}^{${childrenLatex(lim)}}`;
    }
    case "m:bar": {
      const barPr = findFirst(kids, "m:barPr");
      const pos = attr(barPr && findFirst(children(barPr), "m:pos"), "m:val");
      const e = findFirst(kids, "m:e");
      return pos === "bot" ? `\\underline{${childrenLatex(e)}}` : `\\overline{${childrenLatex(e)}}`;
    }
    case "m:groupChr": {
      const gPr = findFirst(kids, "m:groupChrPr");
      const sym = attr(gPr && findFirst(children(gPr), "m:chr"), "m:val");
      const e = findFirst(kids, "m:e");
      const inner = childrenLatex(e);
      if (sym === "⏟") return `\\underbrace{${inner}}`;
      if (sym === "⏞") return `\\overbrace{${inner}}`;
      return `\\overline{${inner}}`;
    }
    case "m:acc": {
      const accPr = findFirst(kids, "m:accPr");
      const sym = attr(accPr && findFirst(children(accPr), "m:chr"), "m:val");
      const e = findFirst(kids, "m:e");
      const ACC_MAP: Record<string, string> = {
        "̂": "hat", "̃": "tilde", "̄": "bar", "̇": "dot",
        "̈": "ddot", "⃗": "vec", "́": "acute", "̀": "grave", "̆": "breve",
      };
      const cmd = (sym && ACC_MAP[sym]) || "hat";
      return `\\${cmd}{${childrenLatex(e)}}`;
    }
    case "m:m": {
      const rows = findAll(kids, "m:mr").map((r) =>
        findAll(children(r), "m:e").map(childrenLatex).join(" & "),
      );
      return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
    }
    case "m:eqArr": {
      const rows = findAll(kids, "m:e").map(childrenLatex);
      return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
    }
    default:
      // m:r, m:e, m:t, m:box and anything unrecognized: recurse and
      // concatenate, so content is never silently dropped.
      return seqToLatex(kids);
  }
}

function funcNameLatex(fNameNode: OrderedNode | undefined): string {
  if (!fNameNode) return "";
  const kids = children(fNameNode);
  const limLow = findFirst(kids, "m:limLow");
  if (limLow) return nodeToLatex(limLow);
  const raw = childrenLatex(fNameNode).trim();
  if (!raw) return "";
  const key = raw.replace(/\\/g, "").toLowerCase();
  return KNOWN_FUNCS.has(key) ? `\\${key}` : `\\operatorname{${raw}}`;
}

function limBaseLatex(eNode: OrderedNode | undefined): string {
  const raw = childrenLatex(eNode).trim();
  const key = raw.replace(/\\/g, "").toLowerCase();
  return KNOWN_FUNCS.has(key) ? `\\${key}` : raw;
}

function oMathToLatex(oMathNode: OrderedNode): string {
  return seqToLatex(children(oMathNode)).trim();
}

// ---- Paragraph (plain text + inline math) flattening ----

function runText(rNode: OrderedNode): string {
  let s = "";
  for (const k of children(rNode)) {
    const t = tagName(k);
    if (t === "w:t") {
      s += children(k).filter(isText).map(textValue).join("");
    } else if (t === "w:tab") {
      s += "\t";
    } else if (t === "w:br" || t === "w:cr") {
      s += " ";
    } else if (t === "w:noBreakHyphen") {
      s += "-";
    }
  }
  return s;
}

// Walks one paragraph's (or hyperlink's) children in document order,
// interleaving plain text runs with any inline equations converted to
// `\( ... \)` LaTeX — this ordering is exactly why fast-xml-parser is used
// with preserveOrder: true instead of its default tag-grouped output.
function paragraphToLine(pNode: OrderedNode): string {
  let out = "";
  for (const k of children(pNode)) {
    const tag = tagName(k);
    if (tag === "w:r") {
      out += runText(k);
    } else if (tag === "m:oMath") {
      const latex = oMathToLatex(k);
      if (latex) out += `\\(${latex}\\)`;
    } else if (tag === "m:oMathPara") {
      for (const om of findAll(children(k), "m:oMath")) {
        const latex = oMathToLatex(om);
        if (latex) out += `\\(${latex}\\)`;
      }
    } else if (tag === "w:hyperlink" || tag === "w:smartTag") {
      out += paragraphToLine(k);
    }
    // Anything else (bookmarks, proofErr, revision marks, paragraph/run
    // properties) carries no content relevant to bulk import — skipped.
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

export class WordImportError extends Error {}

// Unzips the .docx, parses word/document.xml preserving document order (so
// text and inline math interleave correctly), and returns one string per
// non-empty paragraph — each a plain line with any equations already
// converted to `\( ... \)` LaTeX. Feed the result to
// parseImportWordLines() in schema.ts.
export async function extractWordImportLines(file: File | Blob | ArrayBuffer): Promise<string[]> {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new WordImportError("Couldn't read this file as a .docx (zip) — is it actually a Word file?");
  }

  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new WordImportError(
      "This doesn't look like a valid .docx file — word/document.xml was not found inside it.",
    );
  }
  const xml = await docXmlFile.async("text");

  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false,
  });
  const parsed = parser.parse(xml) as OrderedNode[];

  const documentNode = findFirst(parsed, "w:document");
  const bodyNode = documentNode && findFirst(children(documentNode), "w:body");
  if (!bodyNode) {
    throw new WordImportError("Couldn't find the document body — the file may be corrupted.");
  }

  const lines: string[] = [];
  for (const child of children(bodyNode)) {
    const tag = tagName(child);
    if (tag === "w:p") {
      const line = paragraphToLine(child);
      if (line) lines.push(line);
    } else if (tag === "m:oMathPara") {
      const parts = findAll(children(child), "m:oMath")
        .map(oMathToLatex)
        .filter(Boolean);
      if (parts.length) lines.push(parts.map((p) => `\\(${p}\\)`).join(" "));
    }
    // w:tbl (tables) and w:sectPr are out of scope for v1.
  }
  return lines;
}
