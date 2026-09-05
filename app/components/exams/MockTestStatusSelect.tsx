"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AppSelectPicker } from "@/app/components/common/AppSelectPicker";
import { changeMockTestStatus } from "@/app/lib/exams/actions";
import type { ServiceOption } from "@/app/lib/db/serviceOptions";
import { notify } from "@/app/lib/shared/toast";

// Inline "Status" dropdown for the exam designer — same field/placement
// pattern as the question form's Status picker, unlike MockTestStatusBadge
// (a click-to-open popup used in the list/detail views) which doesn't fit a
// compact form row.
export default function MockTestStatusSelect({
  mockTestId,
  examName,
  status,
  examStatusOptions,
}: {
  mockTestId: string;
  examName: string;
  status: number;
  examStatusOptions: ServiceOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: number | null) {
    if (value === null || value === status) return;
    startTransition(async () => {
      const res = await changeMockTestStatus(mockTestId, value);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`${examName || "Exam"} status updated.`, "success");
      router.refresh();
    });
  }

  return (
    <AppSelectPicker
      value={status}
      onChange={handleChange}
      disabled={isPending}
      cleanable={false}
      block
      data={examStatusOptions.map((o) => ({ value: o.value, label: o.displayLabel }))}
    />
  );
}
