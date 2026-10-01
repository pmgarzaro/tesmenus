import { eq, sql } from "drizzle-orm";
import { createRecipe } from "@/lib/recipes/repo";
import { parseIngredientLine } from "@/lib/recipes/normalize";
import { getDb, schema } from "./index";
import { SEED_RECIPES } from "./seed-data";

// Inserts the sample recipes if the household's library is empty.
// Returns the number added.
export function seedIfEmpty(householdId: number): number {
  const [{ count }] = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId))
    .all();
  if (count > 0) return 0;

  for (const r of SEED_RECIPES) {
    createRecipe(householdId, {
      title: r.title,
      description: r.description ?? null,
      servings: r.servings,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      mealType: r.mealType,
      tags: r.tags,
      sourceUrl: null,
      notes: null,
      fridgeDays: r.fridgeDays,
      freezable: r.freezable,
      ingredients: r.ingredients.map(([, aisle, quantity, unit, line]) => ({
        quantity,
        unit,
        label: parseIngredientLine(line).label,
        aisle,
        optional: false,
      })),
      steps: r.steps.map(([text, durationMinutes, type, equipment, temperature]) => ({
        text,
        durationMinutes,
        type,
        equipment,
        temperature,
      })),
    });
  }
  return SEED_RECIPES.length;
}
