// Validation of food-journal input, shared by the MCP tools and the app's forms.
import { z } from "zod";
import { LOG_SLOTS } from "@/db/schema";
import { isValidDate } from "@/lib/planning/dates";

export type LogSlot = (typeof LOG_SLOTS)[number];

export const LOG_SLOT_LABELS: Record<LogSlot, string> = {
  breakfast: "Petit-déjeuner",
  lunch: "Déjeuner",
  snack: "Collation",
  dinner: "Dîner",
  dessert: "Dessert",
};

/** At most this many days in one journal query. */
export const MAX_RANGE_DAYS = 92;

export const dateSchema = z
  .string()
  .refine(isValidDate, { message: "Date invalide : format attendu YYYY-MM-DD (ex. 2026-11-05)" });

export const slotSchema = z.enum(LOG_SLOTS, {
  message: `Créneau inconnu : valeurs possibles ${LOG_SLOTS.join(", ")}`,
});

const kcal = z.number().min(0).max(10_000);
const grams = z.number().min(0).max(1_000);

/** Fields of a journal entry, as accepted on creation. */
export const logEntrySchema = z.object({
  date: dateSchema,
  slot: slotSchema,
  description: z.string().trim().min(1, "La description est obligatoire").max(500),
  recipeId: z.number().int().positive().nullable().default(null),
  servings: z.number().gt(0).max(50).nullable().default(null),
  estKcal: kcal.nullable().default(null),
  estProteinG: grams.nullable().default(null),
  estCarbsG: grams.nullable().default(null),
  estFatG: grams.nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
});

export type LogEntryInput = z.input<typeof logEntrySchema>;

/** Every field optional: only the given ones are changed. */
export const logEntryPatchSchema = z.object({
  date: dateSchema.optional(),
  slot: slotSchema.optional(),
  description: z.string().trim().min(1).max(500).optional(),
  recipeId: z.number().int().positive().nullable().optional(),
  servings: z.number().gt(0).max(50).nullable().optional(),
  estKcal: kcal.nullable().optional(),
  estProteinG: grams.nullable().optional(),
  estCarbsG: grams.nullable().optional(),
  estFatG: grams.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type LogEntryPatch = z.infer<typeof logEntryPatchSchema>;

export const targetsSchema = z.object({
  kcalPerDay: z.number().min(800).max(10_000),
  proteinG: z.number().min(0).max(1_000),
  carbsG: z.number().min(0).max(2_000).nullable().default(null),
  fatG: z.number().min(0).max(1_000).nullable().default(null),
  goalWeightKg: z.number().min(20).max(400).nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
});

export type TargetsInput = z.input<typeof targetsSchema>;

/** Default targets until the user sets their own. */
export const DEFAULT_TARGETS = {
  kcalPerDay: 2170,
  proteinG: 140,
  carbsG: null,
  fatG: null,
  goalWeightKg: null,
  notes: "Valeurs par défaut (à ajuster).",
};
