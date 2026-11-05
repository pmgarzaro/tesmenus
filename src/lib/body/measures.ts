// Body measurements tracked over time, and their trends (pure functions).
import { z } from "zod";
import { dateSchema } from "@/lib/journal/input";
import { addDays } from "@/lib/planning/dates";

export const MEASURES = [
  { key: "weightKg", api: "weight_kg", label: "Poids", short: "Poids", unit: "kg", min: 20, max: 400 },
  { key: "waistCm", api: "waist_cm", label: "Tour de taille (nombril)", short: "Taille", unit: "cm", min: 30, max: 250 },
  { key: "hipsCm", api: "hips_cm", label: "Tour de hanches", short: "Hanches", unit: "cm", min: 30, max: 250 },
  { key: "chestCm", api: "chest_cm", label: "Tour de poitrine", short: "Poitrine", unit: "cm", min: 30, max: 250 },
  { key: "armCm", api: "arm_cm", label: "Tour de bras", short: "Bras", unit: "cm", min: 10, max: 100 },
  { key: "thighCm", api: "thigh_cm", label: "Tour de cuisse", short: "Cuisse", unit: "cm", min: 20, max: 150 },
  { key: "neckCm", api: "neck_cm", label: "Tour de cou", short: "Cou", unit: "cm", min: 20, max: 80 },
  { key: "bodyFatPct", api: "body_fat_pct", label: "Masse grasse (balance)", short: "Gras", unit: "%", min: 2, max: 75 },
] as const;

export type MeasureKey = (typeof MEASURES)[number]["key"];
export type Measures = Record<MeasureKey, number | null>;

/** At most this many days in one query (measurements are sparse). */
export const MAX_BODY_RANGE_DAYS = 731;

const measureShape = Object.fromEntries(
  MEASURES.map((m) => [
    m.key,
    z
      .number()
      .min(m.min, `${m.label} : ${m.min} ${m.unit} minimum`)
      .max(m.max, `${m.label} : ${m.max} ${m.unit} maximum`)
      .nullable()
      .optional(),
  ]),
) as Record<MeasureKey, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;

/** A day's values: given fields are set (null clears one), omitted ones are kept. */
export const bodyEntrySchema = z.object({
  date: dateSchema,
  ...measureShape,
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type BodyEntryInput = z.input<typeof bodyEntrySchema>;

type Entry = Partial<Measures> & { date: string };

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Mean weight over the 7 days ending on each weighed day (smooths water swings). */
export function weightAverages(entries: Entry[]): { date: string; weightKg: number; avg7: number }[] {
  const weighed = entries
    .filter((e): e is Entry & { weightKg: number } => e.weightKg !== null && e.weightKg !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  return weighed.map((e) => {
    const from = addDays(e.date, -6);
    const window = weighed.filter((w) => w.date >= from && w.date <= e.date);
    return { date: e.date, weightKg: e.weightKg, avg7: round(window.reduce((s, w) => s + w.weightKg, 0) / window.length, 2) };
  });
}

const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86_400_000;

/** Least-squares slope in units per week, or null below 2 points over 7+ days. */
export function weeklyRate(points: { date: string; value: number }[]): number | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => dayNumber(p.date));
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.value, 0) / points.length;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += (xs[i] - mx) * (p.value - my);
    den += (xs[i] - mx) ** 2;
  });
  return den ? round((num / den) * 7, 2) : null;
}

export type MeasureSummary = {
  first: { date: string; value: number };
  last: { date: string; value: number };
  change: number;
  /** Per week, from a regression over the last 28 days of the period. */
  ratePerWeek: number | null;
};

/** First / last value and change of each measure over the entries. */
export function summarize(entries: Entry[]): Partial<Record<MeasureKey, MeasureSummary>> {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out: Partial<Record<MeasureKey, MeasureSummary>> = {};
  for (const m of MEASURES) {
    const points = sorted
      .filter((e) => e[m.key] !== null && e[m.key] !== undefined)
      .map((e) => ({ date: e.date, value: e[m.key] as number }));
    if (!points.length) continue;
    const first = points[0];
    const last = points.at(-1)!;
    const recentFrom = addDays(last.date, -27);
    out[m.key] = {
      first,
      last,
      change: round(last.value - first.value, 2),
      ratePerWeek: weeklyRate(points.filter((p) => p.date >= recentFrom)),
    };
  }
  return out;
}
