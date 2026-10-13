"use client";

import { useEffect } from "react";
import "./globals.css";
import StatusScreen from "@/app/components/common/StatusScreen";
import { ErrorIllustration } from "@/app/components/common/StatusIllustrations";
import { buttonClass, primaryButtonClass } from "@/app/components/common/ui";

// Replaces the root layout when the layout itself throws, so it must render
// its own <html>/<body> and import the global stylesheet again. "Try again"
// reloads the page: the layout failed, so there is nothing to re-render in place.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full bg-zinc-50">
        <StatusScreen
          illustration={<ErrorIllustration />}
          eyebrow="Unexpected error"
          title="Something went wrong"
          message="The application could not start. Please reload the page. If it keeps happening, contact support."
          reference={error.digest}
        >
          <button type="button" onClick={() => window.location.reload()} className={primaryButtonClass}>
            Try again
          </button>
          <a href="/" className={buttonClass}>
            Go to home
          </a>
        </StatusScreen>
      </body>
    </html>
  );
}
