import { BackLink } from "@/app/components/common/BackLink";
import { getQuestionForEdit, getReferenceData } from "@/app/lib/questions/data";
import { notFound } from "next/navigation";
import QuestionEditForm from "./QuestionEditForm";

export const metadata = { title: "Question · Question Bank" };
export const dynamic = "force-dynamic";

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [question, referenceData] = await Promise.all([getQuestionForEdit(id), getReferenceData()]);
  if (!question) notFound();

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <BackLink href="/questions" label="Back" />
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">{question.code}</h1>
        </div>
        <span className="text-xs text-zinc-400">
          {question.typeName} · version {question.versionNo} · lot{" "}
          <span className="font-mono">{question.lotNo ?? "—"}</span> · created by {question.createdBy} on{" "}
          {new Date(question.createdOn).toLocaleString()}
        </span>
      </div>

      <QuestionEditForm
        questionId={question.questionId}
        currentStatus={question.status}
        initialInput={question.input}
        referenceData={referenceData}
        lotNo={question.lotNo}
      />
    </div>
  );
}
