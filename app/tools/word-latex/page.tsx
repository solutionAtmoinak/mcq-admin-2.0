import WordLatexConverter from "./WordLatexConverter";

export const metadata = { title: "Word to LaTeX Converter · Tools" };

export default function WordLatexPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Word to LaTeX Converter</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick a Word (.docx) file and get its text with every equation converted to LaTeX — the same reader the case
          study &ldquo;Upload Word&rdquo; uses. Everything runs in your browser; the file is not uploaded anywhere.
        </p>
      </div>
      <WordLatexConverter />
    </div>
  );
}
