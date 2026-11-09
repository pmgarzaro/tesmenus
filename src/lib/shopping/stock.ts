// Shopping list minus what is already in stock.
import type { Unit } from "@/lib/recipes/units";
import { parseStockQuantity, sameFood } from "@/lib/stock/stock";
import { type Amount, type ShoppingItem, formatAmount, gramsPerTablespoon } from "./aggregate";

/** A stock item still good to eat. */
export type StockForList = { name: string; quantity: string | null };

export type StockCover = {
  /** What is in stock, as typed: "Crème fraîche (20 cl)". */
  have: string[];
  /** Enough in stock: nothing to buy. */
  covered: boolean;
  /** Amounts still to buy (= the need when the stock quantity is unknown). */
  toBuy: Amount[];
  /** The stock amount could not be compared with the need: check at home. */
  unsure: boolean;
};

type Family = "g" | "ml" | Unit;
const FAMILY: Partial<Record<Unit, [Family, number]>> = {
  g: ["g", 1],
  kg: ["g", 1000],
  ml: ["ml", 1],
  cl: ["ml", 10],
  l: ["ml", 1000],
};
const family = (u: Unit): [Family, number] => FAMILY[u] ?? [u, 1];

/**
 * Compares the stock with one shopping line. Matching items are added up by
 * unit family (g, ml, pieces, boxes…); a family missing from the stock, or a
 * stock quantity that cannot be read, leaves the line to buy, marked unsure.
 */
export function coverFromStock(item: Pick<ShoppingItem, "name" | "amounts" | "unquantified">, stock: StockForList[]): StockCover | null {
  const matches = stock.filter((s) => sameFood(s.name, item.name));
  if (matches.length === 0) return null;
  const have = matches.map((s) => (s.quantity ? `${s.name} (${s.quantity})` : s.name));

  // Needed without a quantity ("sel", "1 pincée"): having some is enough.
  if (item.amounts.length === 0) return { have, covered: true, toBuy: [], unsure: false };

  const inStock = new Map<Family, number>();
  let unreadable = false;
  for (const s of matches) {
    const q = parseStockQuantity(s.quantity);
    if (!q) {
      unreadable = true;
      continue;
    }
    let [f, factor] = family(q.unit);
    // Spoons in stock are rare; a weight is what the list uses for "beurre", "sucre"…
    if ((q.unit === "cas" || q.unit === "cac") && gramsPerTablespoon(item.name)) {
      [f, factor] = ["g", gramsPerTablespoon(item.name)! / (q.unit === "cac" ? 3 : 1)];
    }
    inStock.set(f, (inStock.get(f) ?? 0) + q.quantity * factor);
  }

  let unsure = false;
  const toBuy: Amount[] = [];
  for (const need of item.amounts) {
    const [f, factor] = family(need.unit);
    const got = inStock.get(f);
    if (got === undefined) {
      unsure = true;
      toBuy.push(need);
      continue;
    }
    const left = need.quantity - got / factor;
    // A crumb short (less than 5 %) counts as enough.
    if (left > need.quantity * 0.05) toBuy.push({ quantity: left, unit: need.unit });
  }
  // Unknown quantity in stock: the user decides, nothing is struck through.
  if (unreadable && toBuy.length > 0) unsure = true;
  return { have, covered: toBuy.length === 0, toBuy, unsure: unsure && toBuy.length > 0 };
}

export const formatAmounts = (amounts: Amount[]) => amounts.map(formatAmount).join(" + ");

/** Stock items still good to eat (a passed date is not counted on). */
export function usableStock<T extends StockForList & { status: string }>(items: T[]): StockForList[] {
  return items.filter((i) => i.status !== "perime").map(({ name, quantity }) => ({ name, quantity }));
}
