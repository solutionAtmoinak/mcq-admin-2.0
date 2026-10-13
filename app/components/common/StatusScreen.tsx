import type { ReactNode } from "react";

// Shared layout for the app-level error / not-found screens (error.tsx,
// global-error.tsx, not-found.tsx).
export default function StatusScreen({
  illustration,
  eyebrow,
  title,
  message,
  reference,
  children,
}: {
  illustration: ReactNode;
  eyebrow: string;
  title: string;
  message: string;
  reference?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-brand-soft to-transparent" />
      <div className="relative flex w-full max-w-lg flex-col items-center rounded-2xl border border-zinc-200 bg-white/90 px-6 py-10 text-center shadow-sm backdrop-blur sm:px-10">
        {illustration}
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-brand">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">{title}</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">{message}</p>
        {reference && (
          <p className="mt-4 rounded-md bg-zinc-100 px-2.5 py-1 font-mono text-xs text-zinc-500">Ref: {reference}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>
      </div>
    </main>
  );
}
