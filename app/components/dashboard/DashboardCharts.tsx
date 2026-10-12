"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { ApexOptions } from "apexcharts";

// ApexCharts touches `window` on import, so it's loaded client-side only.
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="h-full min-h-48 animate-pulse rounded-lg bg-zinc-100" />,
});

// Brand-first categorical palette (indigo-600 leads), validated for both themes.
const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#14b8a6"];
const INDIGO = "#4f46e5";

// Presentation-only: a status's machine key picks its colour so e.g. Published
// is always green. Unknown keys fall back to the palette by position.
const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: "#10b981",
  APPROVED: "#10b981",
  DRAFT: "#f59e0b",
  PENDING: "#f59e0b",
  IN_REVIEW: "#0ea5e9",
  ARCHIVED: "#a1a1aa",
  REJECTED: "#f43f5e",
};

type Slice = { key: string; label: string; count: number };

function useBase() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const fore = dark ? "#a1a1aa" : "#71717a";
  const grid = dark ? "#2e2e34" : "#f0f0f2";
  const base: ApexOptions = {
    chart: {
      background: "transparent",
      foreColor: fore,
      toolbar: { show: false },
      fontFamily: "inherit",
      animations: { speed: 500 },
    },
    theme: { mode: dark ? "dark" : "light" },
    grid: { borderColor: grid, strokeDashArray: 4 },
    tooltip: { theme: dark ? "dark" : "light" },
    dataLabels: { enabled: false },
    legend: { labels: { colors: fore } },
  };
  return { base, dark, fore, grid };
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center text-sm text-zinc-400">
      {text}
    </div>
  );
}

// One colour per slice, never repeated: a status's machine key picks its
// preferred colour (Approved/Published green, Draft amber, ...), and if that
// colour is already taken — or the key is unknown — the next unused palette
// colour is used instead, so two statuses can't end up looking identical.
function sliceColors(data: Slice[]): string[] {
  const used = new Set<string>();
  const pickFree = () => PALETTE.find((c) => !used.has(c)) ?? PALETTE[used.size % PALETTE.length];
  return data.map((d) => {
    const preferred = STATUS_COLORS[d.key];
    const color = preferred && !used.has(preferred) ? preferred : pickFree();
    used.add(color);
    return color;
  });
}

export function DonutChart({
  data,
  totalLabel,
  emptyText = "Nothing to show yet.",
}: Readonly<{ data: Slice[]; totalLabel: string; emptyText?: string }>) {
  const { base, dark, fore } = useBase();
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <Empty text={emptyText} />;

  const colors = sliceColors(data);
  const options: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "donut" },
    labels: data.map((d) => d.label),
    colors,
    stroke: { width: 2, colors: [dark ? "#1f1f23" : "#ffffff"] },
    legend: { position: "bottom", labels: { colors: fore }, markers: { size: 6 } },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: { color: fore, fontSize: "12px" },
            value: { color: dark ? "#f4f4f5" : "#18181b", fontSize: "26px", fontWeight: 600 },
            total: { show: true, label: totalLabel, color: fore, fontSize: "12px" },
          },
        },
      },
    },
  };
  return (
    <ReactApexChart
      key={dark ? "d" : "l"}
      type="donut"
      height={290}
      options={options}
      series={data.map((d) => d.count)}
    />
  );
}

// Status breakdown without a chart library: big total, one stacked bar for
// the overall split, then a row per status with its own progress bar — the
// same visual language as TopExamsList, so the two side-by-side panels match.
export function StatusBreakdown({
  data,
  totalLabel,
  emptyText = "Nothing to show yet.",
}: Readonly<{ data: Slice[]; totalLabel: string; emptyText?: string }>) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <Empty text={emptyText} />;
  const colors = sliceColors(data);
  const pct = (n: number) => (n / total) * 100;

  // h-full + flex-1 on the list: fills whatever height the panel gets from
  // the taller panel beside it, spreading the rows evenly down to the bottom.
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums text-zinc-900">
          {total.toLocaleString("en-IN")}
        </span>
        <span className="text-sm text-zinc-500">{totalLabel}</span>
      </div>

      <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-indigo-600/10">
        {data.map(
          (d, i) =>
            d.count > 0 && (
              <span
                key={d.key + i}
                title={`${d.label}: ${d.count}`}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${pct(d.count)}%`, background: colors[i] }}
              />
            ),
        )}
      </div>

      <ul className="mt-5 flex flex-1 flex-col justify-between gap-1">
        {data.map((d, i) => (
          <li
            key={d.key + i}
            className="rounded-lg px-2 py-2 transition-colors hover:bg-zinc-50"
          >
            <div className="flex items-center gap-3 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i] }} />
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{d.label}</span>
              <span className="font-semibold tabular-nums text-zinc-900">
                {d.count.toLocaleString("en-IN")}
              </span>
              <span className="w-12 text-right text-xs tabular-nums text-zinc-400">
                {pct(d.count).toFixed(1)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-indigo-600/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct(d.count)}%`, background: colors[i] }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AttemptsAreaChart({
  data,
}: Readonly<{ data: { day: string; count: number }[] }>) {
  const { base } = useBase();
  if (data.every((d) => d.count === 0)) return <Empty text="No student attempts in the last 14 days." />;

  const options: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "area", zoom: { enabled: false } },
    colors: [INDIGO],
    stroke: { curve: "smooth", width: 3 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.02, stops: [0, 95, 100] },
    },
    markers: { size: 0, hover: { size: 5 } },
    xaxis: {
      categories: data.map((d) =>
        new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      ),
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: 7,
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v) => String(Math.round(v)) } },
  };
  return (
    <ReactApexChart
      key={String(base.theme?.mode)}
      type="area"
      height={290}
      options={options}
      series={[{ name: "Attempts", data: data.map((d) => d.count) }]}
    />
  );
}

// Ranked list with proportional bars instead of a chart: every exam keeps a
// full, readable name and an exact number (a treemap shrinks or drops labels
// in small tiles), and the height is fixed per row so 10 exams can't stretch
// the panel or the donut beside it. Bar length = attempts relative to the top
// exam; the thinner inner bar = how many of those attempts were distinct
// students.
export function TopExamsList({
  data,
}: Readonly<{ data: { name: string; code: string; attempts: number; students: number }[] }>) {
  if (data.length === 0) return <Empty text="No student has attempted an exam yet." />;
  const max = Math.max(...data.map((d) => d.attempts), 1);

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600" /> Attempts
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> Unique students
        </span>
      </div>
      <ol className="flex flex-col gap-1">
        {data.map((d, i) => (
          <li
            key={d.code + i}
            title={`${d.name} — ${d.attempts} attempts · ${d.students} unique students`}
            className="group grid grid-cols-[1.5rem_minmax(0,11rem)_1fr_auto] items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-zinc-50"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                i === 0 ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {i + 1}
            </span>
            <span className="truncate text-sm font-medium text-zinc-800">{d.name}</span>
            <span className="relative h-3 overflow-hidden rounded-full bg-indigo-600/10">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-indigo-600 transition-all"
                style={{ width: `${(d.attempts / max) * 100}%` }}
              />
              <span
                className="absolute inset-y-[3px] left-0 rounded-full bg-sky-400"
                style={{ width: `${(Math.min(d.students, d.attempts) / max) * 100}%` }}
              />
            </span>
            <span className="w-24 text-right text-sm tabular-nums text-zinc-900">
              <span className="font-semibold">{d.attempts}</span>
              <span className="text-xs text-zinc-400"> · {d.students} stu.</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LotColumnChart({
  data,
}: Readonly<{ data: { lotNo: string; createdOn: string; count: number }[] }>) {
  const { base, fore } = useBase();
  // Where ApexCharts actually put the plot area (px, relative to the chart).
  // The label row below is sized to exactly this, so each label sits centred
  // under its bar however many lots there are — no guessed offsets.
  const [plot, setPlot] = useState<{ left: number; width: number } | null>(null);
  if (data.length === 0) return <Empty text="No question lots yet." />;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- apexcharts' chart context is untyped
  const measure = (ctx: any) => {
    const g = ctx?.w?.globals;
    if (!g) return;
    const next = { left: Math.round(g.translateX), width: Math.round(g.gridWidth) };
    setPlot((p) => (p && p.left === next.left && p.width === next.width ? p : next));
  };

  // Fixed slot per lot: with many lots the chart grows wider than its card
  // and scrolls sideways instead of squeezing the labels together.
  const slotPx = 150;
  const options: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "bar", events: { mounted: measure, updated: measure } },
    colors: [INDIGO],
    plotOptions: { bar: { borderRadius: 6, columnWidth: "42%", dataLabels: { position: "top" } } },
    dataLabels: {
      enabled: true,
      offsetY: -22,
      style: { fontSize: "12px", fontWeight: 600, colors: [fore] },
    },
    xaxis: {
      categories: data.map((d) => d.lotNo),
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v) => String(Math.round(v)) } },
    tooltip: {
      ...base.tooltip,
      x: {
        formatter: (_v, o) => {
          const lot = data[o?.dataPointIndex ?? -1];
          return lot ? `${lot.lotNo} · ${fmt(lot.createdOn)}` : "";
        },
      },
    },
  };
  return (
    <div className="overflow-x-auto pb-2">
      <div style={{ minWidth: data.length * slotPx }}>
        <ReactApexChart
          key={String(base.theme?.mode)}
          type="bar"
          height={300}
          width="100%"
          options={options}
          series={[{ name: "Questions", data: data.map((d) => d.count) }]}
        />
        {plot && (
          <div className="flex" style={{ marginLeft: plot.left, width: plot.width }}>
            {data.map((d) => (
              <div key={d.lotNo} className="min-w-0 flex-1 px-1 text-center">
                <div className="text-sm font-bold text-indigo-600 dark:text-indigo-300">
                  {fmt(d.createdOn)}
                </div>
                <div className="mt-0.5 break-all text-[10px] leading-tight text-zinc-500">{d.lotNo}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SimpleBarChart({
  data,
  name,
  emptyText = "Nothing to show yet.",
}: Readonly<{ data: Slice[]; name: string; emptyText?: string }>) {
  const { base } = useBase();
  if (data.every((d) => d.count === 0)) return <Empty text={emptyText} />;

  const options: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "bar" },
    colors: data.map((_, i) => PALETTE[i % PALETTE.length]),
    plotOptions: { bar: { distributed: true, borderRadius: 6, columnWidth: "52%" } },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: "11px" },
    },
    xaxis: {
      categories: data.map((d) => d.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v) => String(Math.round(v)) } },
  };
  return (
    <ReactApexChart
      key={String(base.theme?.mode)}
      type="bar"
      height={290}
      options={options}
      series={[{ name, data: data.map((d) => d.count) }]}
    />
  );
}
