"use client";

import { useRouter } from "next/navigation";
import { FiChevronDown } from "react-icons/fi";

// Lives outside the filter <form>, so a change here can't just submit — it
// navigates straight to the href for that page size (computed server-side,
// one per option, with page reset to 1).
export function PageSizeSelect({
  value,
  options,
  hrefByPageSize,
}: {
  value: number;
  options: readonly number[];
  hrefByPageSize: Record<number, string>;
}) {
  const router = useRouter();

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          const href = hrefByPageSize[Number(e.target.value)];
          if (href) router.push(href);
        }}
        className="appearance-none rounded-md border border-zinc-300 bg-white py-1 pl-2.5 pr-7 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <FiChevronDown
        size={12}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
      />
    </div>
  );
}
