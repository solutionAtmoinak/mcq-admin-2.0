import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/app/components/common/BackLink";
import { CreateTagsButton, RenameButton } from "@/app/components/tags/TagForms";
import { getReferenceData } from "@/app/lib/questions/data";
import { getTagDimension } from "@/app/lib/tags/data";

export const metadata = { title: "Tag Key · Question Bank" };
export const dynamic = "force-dynamic";

// One key and all its values, with how many questions use each. A value's count
// links to the question bank filtered by that key + value.
export default async function TagDimensionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dimensionId = Number(id);
  if (!Number.isInteger(dimensionId) || dimensionId <= 0) notFound();

  const [dimension, referenceData] = await Promise.all([getTagDimension(dimensionId), getReferenceData()]);
  if (!dimension) notFound();

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackLink href="/tags" label="Back" />
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{dimension.name}</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {dimension.tags.length} value(s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RenameButton kind="key" dimensionId={dimension.dimensionId} currentName={dimension.name} />
          <CreateTagsButton referenceData={referenceData} initialKey={dimension.name} label="Add value" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Questions</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dimension.tags.map((t) => (
                <tr key={t.tagId} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-zinc-900">{t.name}</td>
                  <td className="px-4 py-2 text-zinc-700">
                    {t.questionCount > 0 ? (
                      <Link
                        href={`/questions?tagKey=${encodeURIComponent(dimension.name)}&tagValue=${encodeURIComponent(t.name)}`}
                        className="underline"
                        title="View these questions in the question bank"
                      >
                        {t.questionCount}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{new Date(t.createdOn).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <RenameButton
                      kind="value"
                      dimensionId={dimension.dimensionId}
                      tagId={t.tagId}
                      currentName={t.name}
                    />
                  </td>
                </tr>
              ))}
              {dimension.tags.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                    No values under this key yet — use &ldquo;Add value&rdquo;.
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
