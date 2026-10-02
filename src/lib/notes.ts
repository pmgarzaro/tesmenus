// Magnet colours on the fridge door: by kind of dish, so the library reads at a glance.
import { fold } from "@/lib/recipes/normalize";

export type Magnet = "magnet-red" | "magnet-blue" | "magnet-yellow" | "magnet-green";

const KINDS: [RegExp, Magnet][] = [
  [/\b(poisson|fruits de mer)\b/, "magnet-blue"],
  [/\b(viande|boeuf|porc|poulet|volaille|agneau|veau)\b/, "magnet-red"],
  [/\b(vege|vegetarien|vegan)\b/, "magnet-green"],
  [/\b(dessert|gouter|sucre)\b/, "magnet-yellow"],
];

export function magnetForTags(tags: string[], mealType?: string): Magnet {
  const t = fold([...tags, mealType === "dessert" ? "dessert" : ""].join(" "));
  return KINDS.find(([re]) => re.test(t))?.[1] ?? "magnet-yellow";
}

const MAGNETS: Magnet[] = ["magnet-red", "magnet-blue", "magnet-yellow", "magnet-green"];

/** Varied colours for a series of items (days of the week, aisles, letters…). */
export const magnetAt = (i: number): Magnet => MAGNETS[i % MAGNETS.length];
