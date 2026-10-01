import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

// Full JSON dump of the database (images stay in data/uploads).
export function GET() {
  const db = getDb();
  const dump = {
    exportedAt: new Date().toISOString(),
    recipes: db.select().from(schema.recipes).all(),
    ingredients: db.select().from(schema.ingredients).all(),
    recipeIngredients: db.select().from(schema.recipeIngredients).all(),
    recipeSteps: db.select().from(schema.recipeSteps).all(),
    mealPlans: db.select().from(schema.mealPlans).all(),
    mealPlanEntries: db.select().from(schema.mealPlanEntries).all(),
    shoppingListItems: db.select().from(schema.shoppingListItems).all(),
    batchSessions: db.select().from(schema.batchSessions).all(),
    settings: db.select().from(schema.settings).all(),
  };
  const date = dump.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tesmenus-${date}.json"`,
    },
  });
}
