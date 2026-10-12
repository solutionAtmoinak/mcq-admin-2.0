"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MdOutlineDarkMode, MdOutlineLightMode } from "react-icons/md";

const subscribe = () => () => {};

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // resolvedTheme is undefined on the server; render a neutral button until
  // hydrated so the icon never mismatches.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-brand"
    >
      {isDark ? <MdOutlineLightMode size={18} /> : <MdOutlineDarkMode size={18} />}
    </button>
  );
}
