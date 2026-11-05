// Food journal (what was actually eaten) and nutrition targets, per user.
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays } from "@/lib/planning/dates";
import {
  DEFAULT_TARGETS,
  type LogEntryInput,
  type LogEntryPatch,
  MAX_RANGE_DAYS,
  type TargetsInput,
  logEntryPatchSchema,
  logEntrySchema,
  targetsSchema,
} from "./input";

/** Error with a message meant for the caller (shown to Claude or in the app). */
export class JournalError extends Error {}

export type Owner = { userId: number; householdId: number };

export type LogEntry = typeof schema.mealLog.$inferSelect;

const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner", "dessert"];

function assertRecipe(owner: Owner, recipeId: number | null | undefined) {
  if (recipeId === null || recipeId === undefined) return;
  const recipe = getDb()
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, owner.householdId)))
    .get();
  if (!recipe) throw new JournalError(`Recette ${recipeId} introuvable`);
}

export function getLogEntry(owner: Owner, id: number): LogEntry | null {
  return (
    getDb()
      .select()
      .from(schema.mealLog)
      .where(and(eq(schema.mealLog.id, id), eq(schema.mealLog.userId, owner.userId)))
      .get() ?? null
  );
}

export function addLogEntry(owner: Owner, input: LogEntryInput): LogEntry {
  const values = logEntrySchema.parse(input);
  assertRecipe(owner, values.recipeId);
  return getDb()
    .insert(schema.mealLog)
    .values({ ...values, userId: owner.userId, servings: values.recipeId === null ? values.servings : values.servings ?? 1 })
    .returning()
    .get();
}

export function updateLogEntry(owner: Owner, id: number, patch: LogEntryPatch): LogEntry {
  const values = logEntryPatchSchema.parse(patch);
  if (!getLogEntry(owner, id)) throw new JournalError(`Entrée ${id} introuvable dans le journal`);
  assertRecipe(owner, values.recipeId);
  if (Object.keys(values).length) {
    getDb().update(schema.mealLog).set(values).where(eq(schema.mealLog.id, id)).run();
  }
  return getLogEntry(owner, id)!;
}

export function deleteLogEntry(owner: Owner, id: number): boolean {
  const res = getDb()
    .delete(schema.mealLog)
    .where(and(eq(schema.mealLog.id, id), eq(schema.mealLog.userId, owner.userId)))
    .run();
  return res.changes > 0;
}

export type DayTotals = {
  date: string;
  estKcal: number;
  estProteinG: number;
  estCarbsG: number;
  estFatG: number;
  entries: number;
  /** Entries with no kcal or no protein estimate (not counted in that total). */
  entriesWithoutEstimate: number;
  /** Entries with no carbs or no fat estimate. */
  entriesWithoutMacros: number;
};

type Estimates = Pick<LogEntry, "date" | "estKcal" | "estProteinG" | "estCarbsG" | "estFatG">;

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Totals per date, in order. Days without any entry are left out. */
export function totalsByDate(entries: Estimates[]): DayTotals[] {
  const byDate = new Map<string, DayTotals>();
  for (const e of entries) {
    const t = byDate.get(e.date) ?? {
      date: e.date,
      estKcal: 0,
      estProteinG: 0,
      estCarbsG: 0,
      estFatG: 0,
      entries: 0,
      entriesWithoutEstimate: 0,
      entriesWithoutMacros: 0,
    };
    t.entries++;
    t.estKcal += e.estKcal ?? 0;
    t.estProteinG += e.estProteinG ?? 0;
    t.estCarbsG += e.estCarbsG ?? 0;
    t.estFatG += e.estFatG ?? 0;
    if (e.estKcal === null || e.estProteinG === null) t.entriesWithoutEstimate++;
    if (e.estCarbsG === null || e.estFatG === null) t.entriesWithoutMacros++;
    byDate.set(e.date, t);
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      ...t,
      estKcal: Math.round(t.estKcal),
      estProteinG: round1(t.estProteinG),
      estCarbsG: round1(t.estCarbsG),
      estFatG: round1(t.estFatG),
    }));
}

export function listLog(owner: Owner, dateFrom: string, dateTo = dateFrom) {
  if (dateTo < dateFrom) throw new JournalError("date_to doit être postérieure ou égale à date_from");
  if (addDays(dateFrom, MAX_RANGE_DAYS - 1) < dateTo) {
    throw new JournalError(`Période trop longue : ${MAX_RANGE_DAYS} jours maximum`);
  }
  const entries = getDb()
    .select()
    .from(schema.mealLog)
    .where(
      and(eq(schema.mealLog.userId, owner.userId), gte(schema.mealLog.date, dateFrom), lte(schema.mealLog.date, dateTo)),
    )
    .orderBy(asc(schema.mealLog.date), asc(schema.mealLog.id))
    .all()
    .sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.id - b.id);
  return { entries, totals: totalsByDate(entries) };
}

export type Targets = {
  kcalPerDay: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  notes: string | null;
  isDefault: boolean;
};

export function getTargets(owner: Owner): Targets {
  const row = getDb()
    .select()
    .from(schema.nutritionTargets)
    .where(eq(schema.nutritionTargets.userId, owner.userId))
    .get();
  if (!row) return { ...DEFAULT_TARGETS, isDefault: true };
  return {
    kcalPerDay: row.kcalPerDay,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    notes: row.notes,
    isDefault: false,
  };
}

export function setTargets(owner: Owner, input: TargetsInput): Targets {
  const values = targetsSchema.parse(input);
  getDb()
    .insert(schema.nutritionTargets)
    .values({ userId: owner.userId, ...values })
    .onConflictDoUpdate({
      target: schema.nutritionTargets.userId,
      set: { ...values, updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) },
    })
    .run();
  return getTargets(owner);
}
