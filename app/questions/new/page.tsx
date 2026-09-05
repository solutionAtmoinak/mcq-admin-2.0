import { getReferenceData, getTodayQuestions } from "@/app/lib/questions/data";
import QuestionBankEditor from "./QuestionBankEditor";

export const metadata = { title: "Create Questions · Question Bank" };
// The side explorer needs "today's questions" to reflect the live DB on
// every visit, not a build-time snapshot — this route has no other dynamic
// API calls, so it would otherwise be statically prerendered.
export const dynamic = "force-dynamic";

export default async function NewQuestionsPage() {
  const [referenceData, todayQuestions] = await Promise.all([
    getReferenceData(),
    getTodayQuestions(),
  ]);

  return (
    <div className="flex h-[calc(100dvh-0.1rem)] w-full flex-col overflow-hidden">
      <QuestionBankEditor referenceData={referenceData} todayQuestions={todayQuestions} />
    </div>
  );
}
