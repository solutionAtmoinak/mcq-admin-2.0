"use client";

import { NAV_GROUPS } from "@/app/components/common/navGroups";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MdClose, MdHome, MdSearch } from "react-icons/md";

type NavSearchItem = (typeof SEARCH_ITEMS)[number];

// Built from the shared menu definition, so new pages are searchable
// automatically. Lives here (client) because icon components and match
// functions can't be passed from the server-rendered Header as props.
const SEARCH_ITEMS = [
  { href: "/", label: "MCQ Admin", group: "Home", icon: MdHome },
  ...NAV_GROUPS.flatMap((g) =>
    g.items.map((i) => ({ href: i.href, label: i.label, group: g.label, icon: i.icon })),
  ),
];

// Menu search: filters the side-nav entries by label or section name and
// jumps to the chosen one. Arrow keys + Enter + Escape work; the result list
// is grouped under section headings. Lives in the header.
export default function NavSearch() {
  const items = SEARCH_ITEMS;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Close when clicking outside.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function go(item: NavSearchItem) {
    router.push(item.href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      const hit = results[active];
      if (hit) go(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 transition-colors focus-within:border-brand focus-within:ring-1 focus-within:ring-indigo-500">
        <MdSearch size={18} className="shrink-0 text-brand" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search menu…"
          aria-label="Search menu"
          role="combobox"
          aria-expanded={showList}
          aria-controls="nav-search-results"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <MdClose size={14} />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id="nav-search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg py-4"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">No menu items match “{query.trim()}”.</li>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              const newGroup = i === 0 || results[i - 1].group !== item.group;
              return (
                <li key={item.href} role="presentation">
                  {newGroup && (
                    <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${i === active ? "bg-indigo-600/10 text-brand" : "text-zinc-700"
                      }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="min-w-0 flex-1">{item.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
