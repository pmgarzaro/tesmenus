// Nutrition of stored recipes, and the household's own ingredient values.
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { estimateNutrition } from "@/lib/ai/nutrition";
import type { Unit } from "@/lib/recipes/units";
import { type IngredientNutrition, type NutritionLine, type Per100, computeNutrition, lookupNutrition } from "./compute";

type StoredIngredient = {
  ingredientId: number;
  quantity: number | null;
  unit: Unit | null;
  name: string;
  label: string;
  optional: boolean;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  gramsPerUnit: number | null;
  nutritionSource: "manuel" | "ia" | null;
};

function customOf(i: Omit<StoredIngredient, "quantity" | "unit" | "label" | "optional">): IngredientNutrition | null {
  const per100 =
    i.kcal !== null && i.protein !== null && i.carbs !== null && i.fat !== null
      ? { kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat }
      : null;
  if (!per100 && i.gramsPerUnit === null) return null;
  return { per100, gramsPerUnit: i.gramsPerUnit, source: i.nutritionSource };
}

export function nutritionLines(ingredients: StoredIngredient[]): NutritionLine[] {
  return ingredients.map((i) => ({
    ingredientId: i.ingredientId,
    quantity: i.quantity,
    unit: i.unit,
    name: i.name,
    label: i.label,
    optional: i.optional,
    custom: customOf(i),
  }));
}

export function recipeNutrition(recipe: { servings: number; ingredients: StoredIngredient[] }) {
  return computeNutrition(nutritionLines(recipe.ingredients), recipe.servings);
}

/** Estimated kcal per serving of every recipe, when enough of it is known. */
export function kcalPerServingByRecipe(householdId: number): Map<number, number> {
  const db = getDb();
  const recipes = db
    .select({ id: schema.recipes.id, servings: schema.recipes.servings })
    .from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId))
    .all();
  const rows = db
    .select({
      recipeId: schema.recipeIngredients.recipeId,
      ingredientId: schema.recipeIngredients.ingredientId,
      quantity: schema.recipeIngredients.quantity,
      unit: schema.recipeIngredients.unit,
      label: schema.recipeIngredients.originalLabel,
      optional: schema.recipeIngredients.optional,
      name: schema.ingredients.name,
      kcal: schema.ingredients.kcal,
      protein: schema.ingredients.protein,
      carbs: schema.ingredients.carbs,
      fat: schema.ingredients.fat,
      gramsPerUnit: schema.ingredients.gramsPerUnit,
      nutritionSource: schema.ingredients.nutritionSource,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .where(eq(schema.ingredients.householdId, householdId))
    .all();
  const byRecipe = new Map<number, StoredIngredient[]>();
  for (const r of rows) {
    const list = byRecipe.get(r.recipeId) ?? [];
    list.push({ ...r, label: r.label || r.name });
    byRecipe.set(r.recipeId, list);
  }
  const out = new Map<number, number>();
  for (const r of recipes) {
    const n = recipeNutrition({ servings: r.servings, ingredients: byRecipe.get(r.id) ?? [] });
    if (n.coverage >= 0.75 && n.perServing.kcal > 0) out.set(r.id, n.perServing.kcal);
  }
  return out;
}

export type NutritionInput = { per100?: Per100 | null; gramsPerUnit?: number | null };

/** Saves the household's values for one ingredient (used by every recipe). */
export function saveIngredientNutrition(
  householdId: number,
  ingredientId: number,
  input: NutritionInput,
  source: "manuel" | "ia",
): boolean {
  const values: Partial<typeof schema.ingredients.$inferInsert> = { nutritionSource: source };
  if (input.per100 !== undefined) {
    values.kcal = input.per100?.kcal ?? null;
    values.protein = input.per100?.protein ?? null;
    values.carbs = input.per100?.carbs ?? null;
    values.fat = input.per100?.fat ?? null;
  }
  if (input.gramsPerUnit !== undefined) values.gramsPerUnit = input.gramsPerUnit;
  const res = getDb()
    .update(schema.ingredients)
    .set(values)
    .where(and(eq(schema.ingredients.id, ingredientId), eq(schema.ingredients.householdId, householdId)))
    .run();
  return res.changes > 0;
}

/**
 * Asks the AI for the ingredients that block the estimate: full values for
 * unknown foods, only the piece weight for known ones. Returns how many were filled.
 */
export async function estimateMissingWithAi(
  householdId: number,
  unknown: { ingredientId?: number; name: string; reason: "aliment" | "poids" }[],
): Promise<number> {
  const ids = [...new Set(unknown.map((u) => u.ingredientId).filter((id): id is number => id !== undefined))];
  if (ids.length === 0) return 0;
  const owned = getDb()
    .select({ id: schema.ingredients.id, name: schema.ingredients.name })
    .from(schema.ingredients)
    .where(and(eq(schema.ingredients.householdId, householdId), inArray(schema.ingredients.id, ids)))
    .all();
  const estimates = await estimateNutrition(owned.map((o) => o.name));
  let filled = 0;
  for (const e of estimates) {
    const ing = owned.find((o) => o.name === e.name);
    if (!ing) continue;
    const needsValues = !lookupNutrition(ing.name) && unknown.some((u) => u.ingredientId === ing.id && u.reason === "aliment");
    const input: NutritionInput = { gramsPerUnit: e.gramsPerUnit };
    if (needsValues) input.per100 = { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat };
    if (input.per100 || input.gramsPerUnit) {
      saveIngredientNutrition(householdId, ing.id, input, "ia");
      filled++;
    }
  }
  return filled;
}
