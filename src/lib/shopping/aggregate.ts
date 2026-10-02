// Shopping list maths: scale, convert and add up ingredient quantities.
import type { AISLES } from "@/db/schema";
import { AISLE_LABELS } from "@/lib/labels";
import { fold } from "@/lib/recipes/normalize";
import { UNIT_LABELS, type Unit, formatQuantity } from "@/lib/recipes/units";

type Aisle = (typeof AISLES)[number];

/** One ingredient of one planned meal, already scaled to the meal's servings. */
export type NeedLine = {
  ingredientId: number;
  name: string;
  aisle: Aisle;
  quantity: number | null;
  unit: Unit | null;
  optional: boolean;
  recipe: string;
};

export type Amount = { quantity: number; unit: Unit };

export type ShoppingItem = {
  ingredientId: number;
  name: string;
  aisle: Aisle;
  /** One amount per unit family that could not be converted into another. */
  amounts: Amount[];
  /** Used without a quantity somewhere ("sel, poivre", "1 pincée"). */
  unquantified: boolean;
  /** Only optional in every recipe. */
  optional: boolean;
  recipes: string[];
};

export const AISLE_ORDER: Aisle[] = [
  "fruits-legumes",
  "boucherie",
  "poissonnerie",
  "cremerie",
  "boulangerie",
  "epicerie",
  "surgeles",
  "autre",
];

const TO_GRAMS: Partial<Record<Unit, number>> = { g: 1, kg: 1000 };
const TO_ML: Partial<Record<Unit, number>> = { ml: 1, cl: 10, l: 1000 };
const SPOON_ML: Partial<Record<Unit, number>> = { cas: 15, cac: 5 };

// Grams in one tablespoon, for the usual ingredients (a teaspoon is a third).
const GRAMS_PER_TBSP: Record<string, number> = {
  sucre: 15,
  "sucre roux": 15,
  "sucre glace": 10,
  "sucre vanille": 15,
  farine: 10,
  "farine de ble": 10,
  maizena: 10,
  "fecule de mais": 10,
  beurre: 15,
  sel: 18,
  miel: 20,
  "cacao en poudre": 8,
  cacao: 8,
  "levure chimique": 10,
  "creme fraiche": 15,
  moutarde: 15,
  "concentre de tomate": 16,
  "parmesan": 6,
  "poudre d'amande": 8,
  "amande en poudre": 8,
  "noix de coco rapee": 6,
  "flocons d'avoine": 8,
  riz: 15,
};

export const gramsPerTablespoon = (name: string): number | undefined => GRAMS_PER_TBSP[fold(name)];

// Liquids bought by volume: spoons are converted to ml.
const LIQUID = /^(huile|vinaigre|sauce|lait|eau|vin|jus|creme liquide|bouillon|sirop|nuoc|biere|rhum|cognac|porto|kirsch)/;

/** Adds up the lines of each ingredient, converting units where it makes sense. */
export function aggregate(lines: NeedLine[]): ShoppingItem[] {
  const byIngredient = new Map<number, NeedLine[]>();
  for (const l of lines) byIngredient.set(l.ingredientId, [...(byIngredient.get(l.ingredientId) ?? []), l]);

  const items: ShoppingItem[] = [];
  for (const group of byIngredient.values()) {
    const { ingredientId, name, aisle } = group[0];
    let grams = 0;
    let ml = 0;
    let tbsp = 0;
    const counts = new Map<Unit, number>();
    let unquantified = false;

    const density = gramsPerTablespoon(name);
    const hasVolume = group.some((l) => l.unit && TO_ML[l.unit] && l.quantity !== null);

    for (const l of group) {
      if (l.quantity === null || l.unit === null || l.unit === "pincee") {
        unquantified = true;
        continue;
      }
      const u = l.unit;
      if (TO_GRAMS[u]) grams += l.quantity * TO_GRAMS[u]!;
      else if (TO_ML[u]) ml += l.quantity * TO_ML[u]!;
      else if (SPOON_ML[u]) {
        const spoons = l.quantity * (u === "cas" ? 1 : 1 / 3);
        if (density) grams += spoons * density;
        else if (hasVolume || LIQUID.test(fold(name))) ml += l.quantity * SPOON_ML[u]!;
        else tbsp += spoons;
      } else counts.set(u, (counts.get(u) ?? 0) + l.quantity);
    }

    const amounts: Amount[] = [];
    if (grams > 0) amounts.push({ quantity: grams, unit: "g" });
    if (ml > 0) amounts.push({ quantity: ml, unit: "ml" });
    if (tbsp > 0) amounts.push(tbsp < 1 ? { quantity: tbsp * 3, unit: "cac" } : { quantity: tbsp, unit: "cas" });
    for (const [unit, quantity] of counts) amounts.push({ quantity, unit });

    items.push({
      ingredientId,
      name,
      aisle,
      amounts,
      unquantified: unquantified && amounts.length === 0,
      optional: group.every((l) => l.optional),
      recipes: [...new Set(group.map((l) => l.recipe))],
    });
  }
  return items.sort(
    (a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name, "fr"),
  );
}

const roundUp = (q: number, step: number) => Math.ceil(q / step - 1e-9) * step;
const num = (q: number) => q.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Shop-friendly amount, rounded up: "1,2 kg", "350 g", "45 cl", "3", "2 gousses". */
export function formatAmount({ quantity: q, unit }: Amount): string {
  if (unit === "g") {
    if (q >= 1000) return `${num(roundUp(q / 1000, 0.1))} kg`;
    return `${roundUp(q, q > 100 ? 10 : 5)} g`;
  }
  if (unit === "ml") {
    if (q >= 1000) return `${num(roundUp(q / 1000, 0.1))} l`;
    if (q >= 10) return `${roundUp(q / 10, 1)} cl`;
    return `${roundUp(q, 1)} ml`;
  }
  if (unit === "cas" || unit === "cac") return formatQuantity(roundUp(q, 0.25), unit);
  const n = roundUp(q, 1);
  if (unit === "piece") return String(n);
  return `${n} ${UNIT_LABELS[unit]}${n >= 2 ? "s" : ""}`;
}

export function formatItemAmounts(item: Pick<ShoppingItem, "amounts">): string {
  return item.amounts.map(formatAmount).join(" + ");
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type ExportList = {
  title: string;
  items: { name: string; amount: string; aisle: Aisle }[];
};

/** Plain text for copy-paste / sharing, grouped by aisle. */
export function toText(list: ExportList): string {
  const out = [list.title];
  for (const aisle of AISLE_ORDER) {
    const items = list.items.filter((i) => i.aisle === aisle);
    if (items.length === 0) continue;
    out.push("", AISLE_LABELS[aisle]);
    for (const i of items) out.push(`- ${capitalize(i.name)}${i.amount ? ` : ${i.amount}` : ""}`);
  }
  return out.join("\n");
}
