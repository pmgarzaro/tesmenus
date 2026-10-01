import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "./index";
import { SEED_RECIPES } from "./seed-data";

// Inserts the sample recipes if the household's library is empty.
// Returns the number added.
export function seedIfEmpty(householdId: number): number {
  const db = getDb();
  const [{ count }] = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId))
    .all();
  if (count > 0) return 0;

  db.transaction((tx) => {
    for (const r of SEED_RECIPES) {
      const [{ id: recipeId }] = tx
        .insert(schema.recipes)
        .values({
          householdId,
          title: r.title,
          description: r.description,
          servings: r.servings,
          prepMinutes: r.prepMinutes,
          cookMinutes: r.cookMinutes,
          mealType: r.mealType,
          tags: r.tags,
          fridgeDays: r.fridgeDays,
          freezable: r.freezable,
        })
        .returning({ id: schema.recipes.id })
        .all();

      r.ingredients.forEach(([name, aisle, quantity, unit, label], position) => {
        const [{ id: ingredientId }] = tx
          .insert(schema.ingredients)
          .values({ householdId, name, aisle })
          .onConflictDoUpdate({
            target: [schema.ingredients.householdId, schema.ingredients.name],
            set: { name },
          })
          .returning({ id: schema.ingredients.id })
          .all();
        tx.insert(schema.recipeIngredients)
          .values({ recipeId, ingredientId, position, quantity, unit, originalLabel: label })
          .run();
      });

      r.steps.forEach(([text, durationMinutes, type, equipment, temperature], position) => {
        tx.insert(schema.recipeSteps)
          .values({ recipeId, position, text, durationMinutes, type, equipment, temperature })
          .run();
      });
    }
  });
  return SEED_RECIPES.length;
}
