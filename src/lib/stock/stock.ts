// Household stock (fridge, freezer, cupboards): validation and expiry status.
import { z } from "zod";
import { STOCK_LOCATIONS } from "@/db/schema";
import { dateSchema } from "@/lib/journal/input";

export type StockLocation = (typeof STOCK_LOCATIONS)[number];

export const LOCATION_LABELS: Record<StockLocation, string> = {
  frigo: "Frigo",
  congelateur: "Congélateur",
  placard: "Placard",
};

/** Items expiring within this many days (today included) are "to eat soon". */
export const SOON_DAYS = 3;

/**
 * perime = date passed; bientot = within SOON_DAYS; ok = later; sans-date = no date.
 * In the fridge a passed date means "throw away"; in the cupboard or the freezer
 * it is usually a best-before date: still edible, to check.
 */
export type StockStatus = "perime" | "bientot" | "ok" | "sans-date";

const dayNumber = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);

/** Days from `today` to `expiresOn` (0 = today, negative = passed). */
export function daysLeft(expiresOn: string | null, today: string): number | null {
  return expiresOn ? dayNumber(expiresOn) - dayNumber(today) : null;
}

export function stockStatus(expiresOn: string | null, today: string): StockStatus {
  const d = daysLeft(expiresOn, today);
  if (d === null) return "sans-date";
  if (d < 0) return "perime";
  if (d < SOON_DAYS) return "bientot";
  return "ok";
}

/** "périmé depuis 2 jours", "aujourd'hui", "demain", "dans 5 jours", "dans 7 mois". */
export function expiryText(days: number | null): string {
  if (days === null) return "sans date";
  if (days < -1) return `périmé depuis ${-days} jours`;
  if (days === -1) return "périmé depuis hier";
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days >= 60) return `dans ${Math.round(days / 30)} mois`;
  return `dans ${days} jours`;
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `${max} caractères maximum` })
    .nullable()
    .transform((s) => (s ? s : null));

export const stockItemSchema = z.object({
  name: z.string().trim().min(1, { message: "Indique ce que c'est" }).max(100, { message: "Nom trop long (100 caractères max)" }),
  quantity: nullableText(50).default(null),
  location: z.enum(STOCK_LOCATIONS, { message: `Emplacement inconnu : ${STOCK_LOCATIONS.join(", ")}` }).default("frigo"),
  expiresOn: dateSchema.nullable().default(null),
  note: nullableText(200).default(null),
});

export const stockPatchSchema = z.object({
  name: stockItemSchema.shape.name.optional(),
  quantity: nullableText(50).optional(),
  location: z.enum(STOCK_LOCATIONS, { message: `Emplacement inconnu : ${STOCK_LOCATIONS.join(", ")}` }).optional(),
  expiresOn: dateSchema.nullable().optional(),
  note: nullableText(200).optional(),
});

export type StockItemInput = z.input<typeof stockItemSchema>;
export type StockPatch = z.input<typeof stockPatchSchema>;
