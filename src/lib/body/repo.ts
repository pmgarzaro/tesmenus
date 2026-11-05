// Weight and body measurements, one row per user and day.
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { JournalError, type Owner } from "@/lib/journal/repo";
import { addDays } from "@/lib/planning/dates";
import { type BodyEntryInput, MAX_BODY_RANGE_DAYS, MEASURES, bodyEntrySchema, summarize, weightAverages } from "./measures";

export type BodyEntry = typeof schema.bodyLog.$inferSelect;

export function getBodyEntry(owner: Owner, date: string): BodyEntry | null {
  return (
    getDb()
      .select()
      .from(schema.bodyLog)
      .where(and(eq(schema.bodyLog.userId, owner.userId), eq(schema.bodyLog.date, date)))
      .get() ?? null
  );
}

/** Records a day's measurements; fields not given keep their previous value that day. */
export function saveBodyEntry(owner: Owner, input: BodyEntryInput): BodyEntry {
  const { date, ...values } = bodyEntrySchema.parse(input);
  const given = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  const existing = getBodyEntry(owner, date);
  if (!existing && !MEASURES.some((m) => given[m.key] !== null && given[m.key] !== undefined)) {
    throw new JournalError("Indique au moins une mesure (poids ou mensuration)");
  }
  const db = getDb();
  if (existing) {
    if (Object.keys(given).length) db.update(schema.bodyLog).set(given).where(eq(schema.bodyLog.id, existing.id)).run();
  } else {
    db.insert(schema.bodyLog).values({ userId: owner.userId, date, ...given }).run();
  }
  const saved = getBodyEntry(owner, date)!;
  // A day emptied of every value is removed.
  if (MEASURES.every((m) => saved[m.key] === null) && !saved.notes) {
    deleteBodyEntry(owner, date);
  }
  return saved;
}

export function deleteBodyEntry(owner: Owner, date: string): boolean {
  const res = getDb()
    .delete(schema.bodyLog)
    .where(and(eq(schema.bodyLog.userId, owner.userId), eq(schema.bodyLog.date, date)))
    .run();
  return res.changes > 0;
}

export function listBody(owner: Owner, dateFrom: string, dateTo: string) {
  if (dateTo < dateFrom) throw new JournalError("date_to doit être postérieure ou égale à date_from");
  if (addDays(dateFrom, MAX_BODY_RANGE_DAYS - 1) < dateTo) {
    throw new JournalError(`Période trop longue : ${MAX_BODY_RANGE_DAYS} jours maximum`);
  }
  const entries = getDb()
    .select()
    .from(schema.bodyLog)
    .where(and(eq(schema.bodyLog.userId, owner.userId), gte(schema.bodyLog.date, dateFrom), lte(schema.bodyLog.date, dateTo)))
    .orderBy(asc(schema.bodyLog.date))
    .all();
  return { entries, weight: weightAverages(entries), summary: summarize(entries) };
}

/** Most recent entry with a weight, any date. */
export function latestWeight(owner: Owner): { date: string; weightKg: number } | null {
  const rows = getDb()
    .select({ date: schema.bodyLog.date, weightKg: schema.bodyLog.weightKg })
    .from(schema.bodyLog)
    .where(eq(schema.bodyLog.userId, owner.userId))
    .orderBy(asc(schema.bodyLog.date))
    .all()
    .filter((r): r is { date: string; weightKg: number } => r.weightKg !== null);
  return rows.at(-1) ?? null;
}
