// MCP view of the household stock (fridge, freezer, cupboards).
import { z } from "zod";
import { STOCK_LOCATIONS } from "@/db/schema";
import { dateSchema } from "@/lib/journal/input";
import type { Owner } from "@/lib/journal/repo";
import { type StockItem, addStockItem, listStock, removeStockItems, updateStockItem } from "@/lib/stock/repo";
import { SOON_DAYS } from "@/lib/stock/stock";

export const stockItemView = (i: StockItem) => ({
  id: i.id,
  name: i.name,
  quantity: i.quantity,
  location: i.location,
  expires_on: i.expiresOn,
  days_left: i.daysLeft,
  status: i.status,
  note: i.note,
});

export function stockView(owner: Owner, location?: (typeof STOCK_LOCATIONS)[number]) {
  const items = listStock(owner.householdId).filter((i) => !location || i.location === location);
  const count = (s: StockItem["status"]) => items.filter((i) => i.status === s).length;
  return {
    items: items.map(stockItemView),
    expired_count: count("perime"),
    eat_soon_count: count("bientot"),
    soon_days: SOON_DAYS,
  };
}

const locationSchema = z.enum(STOCK_LOCATIONS).describe("frigo | congelateur | placard");
const itemFields = {
  quantity: z.string().max(50).nullable().optional().describe("Texte libre : « 500 g », « 2 boîtes », « un fond »"),
  location: locationSchema.optional(),
  expires_on: dateSchema.nullable().optional().describe("Date inscrite sur l'emballage (DLC ou DDM), YYYY-MM-DD ; null = sans date"),
  note: z.string().max(200).nullable().optional().describe("Ex. « entamé le 5 », « reste de chili »"),
};

export const addStockShape = {
  items: z
    .array(z.object({ name: z.string().min(1).max(100), ...itemFields }))
    .min(1)
    .max(50)
    .describe("Articles à ajouter (emplacement par défaut : frigo)"),
};

export function addStockFromMcp(owner: Owner, a: z.infer<z.ZodObject<typeof addStockShape>>) {
  const added = a.items.map((i) =>
    addStockItem(owner.householdId, {
      name: i.name,
      quantity: i.quantity ?? null,
      location: i.location ?? "frigo",
      expiresOn: i.expires_on ?? null,
      note: i.note ?? null,
    }),
  );
  return { added: added.map(stockItemView) };
}

export const updateStockShape = {
  id: z.number().int().positive().describe("Identifiant de l'article (voir get_stock)"),
  name: z.string().min(1).max(100).optional(),
  ...itemFields,
};

export function updateStockFromMcp(owner: Owner, a: z.infer<z.ZodObject<typeof updateStockShape>>) {
  return stockItemView(
    updateStockItem(owner.householdId, a.id, {
      name: a.name,
      quantity: a.quantity,
      location: a.location,
      expiresOn: a.expires_on,
      note: a.note,
    }),
  );
}

export function removeStockFromMcp(owner: Owner, ids: number[]) {
  return { removed: removeStockItems(owner.householdId, ids) };
}
