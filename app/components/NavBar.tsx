"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-zinc-200 bg-white">
      <nav className="flex h-full w-full items-center gap-6 px-6 text-sm">
        <Link href="/" className={pathname === '/' ? "font-semibold text-zinc-900" : "text-zinc-600 hover:underline"}>
          MCQ Admin
        </Link>
        <Link href="/questions" className={pathname === '/questions' ? "font-semibold text-zinc-900" : "text-zinc-600 hover:underline"}>
          Question Bank
        </Link>
        <Link
          href="/questions/new"
          className={pathname === '/questions/new' ? "font-semibold text-zinc-900" : "text-zinc-600 hover:underline"}
        >
          Create Questions
        </Link>
      </nav>
    </header>
  );
}
