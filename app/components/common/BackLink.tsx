"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";
import { primaryIconTextButtonClass } from "@/app/components/common/ui";

// Shared "back to parent list" affordance for detail/edit pages — solid
// black pill (primaryIconTextButtonClass, same color as the app's primary
// buttons) instead of a bare underlined text link, so it reads as a control.
// Omit `href` when there's no single fixed parent to link to (e.g. a page
// reachable from more than one place) — it then falls back to
// router.back(), returning to wherever the user actually came from instead
// of a hardcoded destination.
export function BackLink({ href, label }: { href?: string; label: string }) {
  const router = useRouter();

  if (!href) {
    return (
      <button type="button" onClick={() => router.back()} className={primaryIconTextButtonClass}>
        <FiArrowLeft size={13} />
        {label}
      </button>
    );
  }

  return (
    <Link href={href} className={primaryIconTextButtonClass}>
      <FiArrowLeft size={13} />
      {label}
    </Link>
  );
}
