import ImportWorkspace from "./ImportWorkspace";

export const metadata = { title: "Migrate from JSON · Question Bank" };

export default function MigrateFromJsonPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Migrate from JSON</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a pre-built migration JSON file (one row per question, already carrying its
          PresentationJson/AnswerJson/SearchText), review it, then confirm to import every row
          into the Question Bank in one batch.
        </p>
      </div>
      <ImportWorkspace />
    </div>
  );
}
