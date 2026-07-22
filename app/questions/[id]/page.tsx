import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuestionForEdit, getReferenceData } from "@/app/lib/data";
import QuestionEditForm from "./QuestionEditForm";

export const metadata = { title: "Question · Question Bank" };

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
        <div>
          <Link href="/questions" className="text-sm text-zinc-500 underline">
            ← Back to Question Bank
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">{question.code}</h1>
        </div>
        <span className="text-xs text-zinc-400">
          {question.typeName} · version {question.versionNo} · created by {question.createdBy} on{" "}
          {new Date(question.createdOn).toLocaleString()}
        </span>
      </div>

      <QuestionEditForm
        questionId={question.questionId}
        currentStatus={question.status}
        initialInput={question.input}
        referenceData={referenceData}
      />
    </div>
  );
}
