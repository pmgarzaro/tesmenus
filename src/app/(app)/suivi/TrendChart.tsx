"use client";

import { useRef, useState } from "react";

export type Point = { date: string; value: number; trend?: number };

const W = 340;
const H = 170;
const PAD = { top: 10, right: 10, bottom: 22, left: 36 };

const day = (d: string) => Date.parse(`${d}T12:00:00Z`) / 86_400_000;
const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/**
 * One measure over time on a single axis: raw readings as dots and, when
 * given, the 7-day average as a line. Touch or hover shows the nearest day.
 */
export function TrendChart({
  points,
  unit,
  label,
  trendLabel,
}: {
  points: Point[];
  unit: string;
  label: string;
  trendLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (points.length === 0) return <p className="text-sm text-stone-500">Pas encore de relevé.</p>;

  const xs = points.map((p) => day(p.date));
  const values = points.flatMap((p) => (p.trend !== undefined ? [p.value, p.trend] : [p.value]));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const span = Math.max(Math.max(...values) - Math.min(...values), unit === "kg" ? 2 : 2);
  const y0 = Math.min(...values) - span * 0.15;
  const y1 = Math.max(...values) + span * 0.15;
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  const ticks = Array.from({ length: 4 }, (_, i) => y0 + ((i + 0.5) * (y1 - y0)) / 4);
  const hasTrend = points.some((p) => p.trend !== undefined);
  const trendPath = points
    .filter((p) => p.trend !== undefined)
    .map((p, i) => `${i ? "L" : "M"}${sx(day(p.date)).toFixed(1)},${sy(p.trend!).toFixed(1)}`)
    .join(" ");

  const pick = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    xs.forEach((d, i) => {
      if (Math.abs(sx(d) - x) < Math.abs(sx(xs[best]) - x)) best = i;
    });
    setActive(best);
  };

  const a = active !== null ? points[active] : null;
  const ink = "#57534e"; // stone-600
  const dotColor = hasTrend ? "#a8a29e" : "var(--color-magnet-blue)"; // raw readings recede behind the trend

  return (
    <figure className="space-y-1.5">
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 text-xs text-stone-600">
        {hasTrend ? (
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="#a8a29e" /></svg>
              {label}
            </span>
            <span className="flex items-center gap-1">
              <svg width="14" height="10" aria-hidden="true"><path d="M0 5h14" stroke="var(--color-magnet-blue)" strokeWidth="2" /></svg>
              {trendLabel}
            </span>
          </span>
        ) : (
          <span />
        )}
        {a && (
          <span className="font-medium text-ink">
            {fmtDate(a.date)} · {fmt(a.value)} {unit}
            {a.trend !== undefined && ` · moy. ${fmt(a.trend)}`}
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`${label} : de ${fmt(points[0].value)} à ${fmt(points.at(-1)!.value)} ${unit}`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="#e7e5e4" strokeWidth="1" />
            <text x={PAD.left - 5} y={sy(t) + 3.5} textAnchor="end" fontSize="10" fill={ink}>
              {fmt(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} fontSize="10" fill={ink}>
          {fmtDate(points[0].date)}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" fill={ink} textAnchor="end">
          {fmtDate(points.at(-1)!.date)}
        </text>
        {a && <line x1={sx(day(a.date))} x2={sx(day(a.date))} y1={PAD.top} y2={H - PAD.bottom} stroke="#a8a29e" strokeWidth="1" />}
        {!hasTrend && points.length > 1 && (
          <path
            d={points.map((p, i) => `${i ? "L" : "M"}${sx(day(p.date)).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--color-magnet-blue)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={sx(day(p.date))}
            cy={sy(p.value)}
            r={i === active ? 5 : 3.5}
            fill={dotColor}
            stroke="white"
            strokeWidth="2"
          />
        ))}
        {hasTrend && (
          <path d={trendPath} fill="none" stroke="var(--color-magnet-blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
      </svg>
    </figure>
  );
}
