"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FiPackage } from "react-icons/fi";
import LinkPackagesModal from "@/app/components/exams/LinkPackagesModal";
import { iconTextButtonClass } from "@/app/components/common/ui";
import { updateMockTestPackages } from "@/app/lib/exams/actions";
import { notify } from "@/app/lib/shared/toast";
import type { PackageOption } from "@/app/lib/exams/packages";
import type { MockTestPackageLink } from "@/app/lib/exams/data";

export default function LinkPackagesButton({
  mockTestId,
  examName,
  packageOptions,
  packagesError,
  initialPackages,
}: {
  mockTestId: string;
  examName: string;
  packageOptions: PackageOption[];
  packagesError: string | null;
  initialPackages: MockTestPackageLink[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave(packageIds: number[]) {
    startTransition(async () => {
      const res = await updateMockTestPackages(mockTestId, packageIds);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      notify(`Packages updated for "${examName}".`, "success");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={iconTextButtonClass}
        title="Link packages"
      >
        <FiPackage size={13} /> Packages
        {initialPackages.length > 0 && (
          <span className="rounded-full bg-zinc-100 px-1.5 text-xs text-zinc-600">{initialPackages.length}</span>
        )}
      </button>
      {open && (
        <LinkPackagesModal
          open={open}
          onClose={() => setOpen(false)}

          examName={examName}
          packageOptions={packageOptions}
          packagesError={packagesError}
          initialPackages={initialPackages}
          saving={isPending}
          onSave={handleSave}
        />
      )}
    </>
  );
}
