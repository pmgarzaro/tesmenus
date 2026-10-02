// Nutrition estimate of a recipe: per 100 g values × grams of each ingredient.
import { fold, ingredientKey } from "@/lib/recipes/normalize";
import type { Unit } from "@/lib/recipes/units";
import { gramsPerTablespoon } from "@/lib/shopping/aggregate";
import { NUTRITION_TABLE } from "./table";

export type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
export type Macros = Per100;

/** Values stored on an ingredient by the household (override the table). */
export type IngredientNutrition = {
  per100: Per100 | null;
  gramsPerUnit: number | null;
  source: "manuel" | "ia" | null;
};

type Entry = Per100 & { piece?: number };

const INDEX: Map<string, Entry> = new Map();
for (const [names, kcal, protein, carbs, fat, piece] of NUTRITION_TABLE) {
  for (const n of names) {
    const key = ingredientKey(n);
    if (!INDEX.has(key)) INDEX.set(key, { kcal, protein, carbs, fat, piece });
  }
}
const KEYS_BY_LENGTH = [...INDEX.keys()].sort((a, b) => b.length - a.length);

/** Table row for an ingredient name: exact match, else the longest known name it contains ("huile d'olive vierge" → "huile d'olive"). */
export function lookupNutrition(name: string): Entry | null {
  const key = ingredientKey(name);
  if (!key) return null;
  const exact = INDEX.get(key);
  if (exact) return exact;
  const padded = ` ${key} `;
  const k = KEYS_BY_LENGTH.find((t) => padded.includes(` ${t} `));
  return k ? INDEX.get(k)! : null;
}

// Liquids a little lighter / heavier than water (g per ml).
const DENSITY: [RegExp, number][] = [
  [/^huile/, 0.92],
  [/^(miel|sirop)/, 1.4],
  [/^creme/, 1.0],
];
const density = (name: string) => DENSITY.find(([re]) => re.test(fold(name)))?.[1] ?? 1;

// Default weight of one "unit" when the ingredient does not tell.
const UNIT_GRAMS: Partial<Record<Unit, number>> = {
  boite: 400,
  sachet: 10,
  tranche: 30,
  botte: 30,
  gousse: 5,
  pincee: 0.5,
};

/** Grams for a quantity of an ingredient, or null when it cannot be known. */
export function toGrams(quantity: number, unit: Unit | null, name: string, pieceGrams?: number | null): number | null {
  const u = unit ?? "piece";
  switch (u) {
    case "g": return quantity;
    case "kg": return quantity * 1000;
    case "ml": return quantity * density(name);
    case "cl": return quantity * 10 * density(name);
    case "l": return quantity * 1000 * density(name);
    case "cas":
    case "cac": {
      const tbsp = gramsPerTablespoon(name) ?? 15 * density(name);
      return quantity * (u === "cas" ? tbsp : tbsp / 3);
    }
    case "piece":
      return pieceGrams ? quantity * pieceGrams : null;
    default:
      // botte, gousse, boîte, sachet…: the ingredient's own unit weight wins.
      return quantity * (pieceGrams ?? UNIT_GRAMS[u] ?? 0) || null;
  }
}

export type NutritionLine = {
  ingredientId?: number;
  quantity: number | null;
  unit: Unit | null;
  name: string;
  label: string;
  optional: boolean;
  /** Household values for this ingredient, if any. */
  custom?: IngredientNutrition | null;
};

export type NutritionResult = {
  /** For the whole recipe. */
  total: Macros;
  perServing: Macros;
  /** Ingredients that could not be counted, and why. */
  unknown: { ingredientId?: number; name: string; label: string; reason: "aliment" | "poids" }[];
  /** Counted lines / lines that should count. */
  coverage: number;
  /** What each counted ingredient brings to the whole recipe. */
  details: { ingredientId?: number; name: string; label: string; grams: number; kcal: number; source: "table" | "manuel" | "ia" }[];
};

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function computeNutrition(lines: NutritionLine[], servings: number): NutritionResult {
  const total = { ...ZERO };
  const unknown: NutritionResult["unknown"] = [];
  const details: NutritionResult["details"] = [];
  let counted = 0;
  let relevant = 0;
  for (const l of lines) {
    // Optional ingredients and "sel, poivre" without quantity are left out.
    if (l.optional || l.quantity === null) continue;
    const table = lookupNutrition(l.name);
    const values: Per100 | null = l.custom?.per100 ?? table;
    const pieceGrams = l.custom?.gramsPerUnit ?? table?.piece ?? null;
    relevant++;
    if (!values) {
      unknown.push({ ingredientId: l.ingredientId, name: l.name, label: l.label, reason: "aliment" });
      continue;
    }
    const grams = toGrams(l.quantity, l.unit, l.name, pieceGrams);
    if (grams === null) {
      unknown.push({ ingredientId: l.ingredientId, name: l.name, label: l.label, reason: "poids" });
      continue;
    }
    counted++;
    details.push({
      ingredientId: l.ingredientId,
      name: l.name,
      label: l.label,
      grams,
      kcal: (values.kcal * grams) / 100,
      source: l.custom?.per100 || l.custom?.gramsPerUnit ? (l.custom.source ?? "manuel") : "table",
    });
    total.kcal += (values.kcal * grams) / 100;
    total.protein += (values.protein * grams) / 100;
    total.carbs += (values.carbs * grams) / 100;
    total.fat += (values.fat * grams) / 100;
  }
  const s = Math.max(servings, 1);
  return {
    total,
    perServing: { kcal: total.kcal / s, protein: total.protein / s, carbs: total.carbs / s, fat: total.fat / s },
    unknown,
    details,
    coverage: relevant ? counted / relevant : 1,
  };
}

/** Share of calories from each macro (protein 4, carbs 4, fat 9 kcal/g). */
export function energySplit(m: Macros): { protein: number; carbs: number; fat: number } {
  const p = m.protein * 4;
  const c = m.carbs * 4;
  const f = m.fat * 9;
  const sum = p + c + f || 1;
  return { protein: p / sum, carbs: c / sum, fat: f / sum };
}
