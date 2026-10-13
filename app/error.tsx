"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import StatusScreen from "@/app/components/common/StatusScreen";
import { ErrorIllustration } from "@/app/components/common/StatusIllustrations";
import { buttonClass, primaryButtonClass } from "@/app/components/common/ui";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  // Server-side detail stays server-side — log it for diagnostics, but the
  // page only shows the generic message below (no stack/DB errors).
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      illustration={<ErrorIllustration />}
      eyebrow="Unexpected error"
      title="Something went wrong"
      message="We hit a problem loading this page. Please try again. If it keeps happening, contact support."
      reference={error.digest}
    >
      {/* A server-component error needs a server refetch, not just a client re-render. */}
      <button type="button" onClick={() => startTransition(() => { router.refresh(); reset(); })} className={primaryButtonClass}>
        Try again
      </button>
      <a href="/" className={buttonClass}>
        Go to home
      </a>
    </StatusScreen>
  );
}
