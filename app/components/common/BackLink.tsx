import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import { primaryIconTextButtonClass } from "@/app/components/common/ui";

// Shared "back to parent list" affordance for detail/edit pages — solid
// black pill (primaryIconTextButtonClass, same color as the app's primary
// buttons) instead of a bare underlined text link, so it reads as a control.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={primaryIconTextButtonClass}>
      <FiArrowLeft size={13} />
      {label}
    </Link>
  );
}
