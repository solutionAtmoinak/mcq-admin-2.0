import Link from "next/link";
import { FiList, FiSearch } from "react-icons/fi";
import DimensionViewButton from "@/app/components/tags/DimensionViewButton";
import { CreateTagsButton, RenameButton } from "@/app/components/tags/TagForms";
import { iconTextButtonClass, inputClass } from "@/app/components/common/ui";
import { getReferenceData } from "@/app/lib/questions/data";
import { listTagDimensions } from "@/app/lib/tags/data";

export const metadata = { title: "Tags · Question Bank" };
export const dynamic = "force-dynamic";

// Tag keys (subject, chapter, skill, …) with how many values each holds and how
// many questions use them. The eye lists a key's values with their question
// counts; create new key → value pairs here, exactly like on a question.
export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const [dimensions, referenceData] = await Promise.all([listTagDimensions(q), getReferenceData()]);

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Tags</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dimensions.length} key(s) — tags are key → value pairs (e.g. Subject → Reasoning).
          </p>
        </div>
        <CreateTagsButton referenceData={referenceData} />
      </div>

      <form
        method="GET"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search keys…"
          className={`${inputClass} max-w-xs`}
          autoComplete="off"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
        >
          <FiSearch size={14} />
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2">Key</th>
                <th className="px-4 py-2">Questions</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dimensions.map((d) => (
                <tr key={d.dimensionId} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    <Link href={`/tags/${d.dimensionId}`} className="hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {d.questionCount > 0 ? (
                      <Link
                        href={`/questions?tagKey=${encodeURIComponent(d.name)}`}
                        className="underline"
                        title="View these questions in the question bank"
                      >
                        {d.questionCount}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{new Date(d.createdOn).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <DimensionViewButton dimensionId={d.dimensionId} dimensionName={d.name} />
                      <RenameButton kind="key" dimensionId={d.dimensionId} currentName={d.name} />
                      <Link
                        href={`/tags/${d.dimensionId}`}
                        className={iconTextButtonClass}
                        title="Add, edit and review this key's values"
                      >
                        <FiList size={14} /> Manage values
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {dimensions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                    {q ? "No keys match that search." : "No tags yet — use “New tags”, or they appear as questions are tagged."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
