import NavSearch from "@/app/components/common/NavSearch";
import ThemeToggle from "@/app/components/common/ThemeToggle";
import Link from "next/link";
import { FaRocket } from "react-icons/fa";

// Server component: the user comes from the JWT cookie (getUser), so it is
// passed in as plain strings rather than read on the client.
export default function Header({
  name,
  role,
}: Readonly<{
  name: string;
  role: string;
}>) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4">
      <h1 className="hidden shrink-0 truncate text-sm font-semibold text-zinc-900 sm:block">MCQ Admin</h1>
      <div className="flex min-w-0 flex-1 justify-center">
        <NavSearch />
      </div>
      <div className="flex items-center gap-3">
        <Link href='https://proweb.dthlms.com' target="_BLANK" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-brand">
          <FaRocket size={18} />
        </Link>
        <ThemeToggle />
        <div className="flex items-center gap-2 border px-2 py-1 rounded-2xl dark:border-indigo-500/50 border-indigo-600/50">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white"
          >
            {initials}
          </span>
          <div className="text-right leading-tight">
            <p className="max-w-48 truncate text-sm font-semibold">{name}</p>
            {role && <p className="max-w-48 truncate text-xs text-zinc-500">{role}</p>}
          </div>
        </div>
      </div>
    </header>
  );
}
