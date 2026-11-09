// Household stock: shared by the members of a household.
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { JournalError } from "@/lib/journal/repo";
import { today as todayFn } from "@/lib/planning/dates";
import { type StockItemInput, type StockPatch, type StockStatus, daysLeft, stockItemSchema, stockPatchSchema, stockStatus } from "./stock";

export type StockRow = typeof schema.stockItems.$inferSelect;
export type StockItem = StockRow & { daysLeft: number | null; status: StockStatus };

const withStatus = (r: StockRow, today: string): StockItem => ({
  ...r,
  daysLeft: daysLeft(r.expiresOn, today),
  status: stockStatus(r.expiresOn, today),
});

/** Soonest date first, items without a date last, then by name. */
export function listStock(householdId: number, today = todayFn()): StockItem[] {
  return getDb()
    .select()
    .from(schema.stockItems)
    .where(eq(schema.stockItems.householdId, householdId))
    .all()
    .sort(
      (a, b) =>
        (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999") || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
    )
    .map((r) => withStatus(r, today));
}

function getRow(householdId: number, id: number): StockRow {
  const row = getDb()
    .select()
    .from(schema.stockItems)
    .where(and(eq(schema.stockItems.id, id), eq(schema.stockItems.householdId, householdId)))
    .get();
  if (!row) throw new JournalError(`Article ${id} introuvable dans le stock`);
  return row;
}

export function addStockItem(householdId: number, input: StockItemInput, today = todayFn()): StockItem {
  const values = stockItemSchema.parse(input);
  const row = getDb().insert(schema.stockItems).values({ householdId, ...values }).returning().get();
  return withStatus(row, today);
}

/** Only the fields given change; null clears an optional field. */
export function updateStockItem(householdId: number, id: number, patch: StockPatch, today = todayFn()): StockItem {
  getRow(householdId, id);
  const values = Object.fromEntries(Object.entries(stockPatchSchema.parse(patch)).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length) {
    getDb().update(schema.stockItems).set(values).where(eq(schema.stockItems.id, id)).run();
  }
  return withStatus(getRow(householdId, id), today);
}

/** Removes items (eaten or thrown away); returns how many were removed. */
export function removeStockItems(householdId: number, ids: number[]): number {
  if (ids.length === 0) return 0;
  return getDb()
    .delete(schema.stockItems)
    .where(and(eq(schema.stockItems.householdId, householdId), inArray(schema.stockItems.id, ids)))
    .run().changes;
}
