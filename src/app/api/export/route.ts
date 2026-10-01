import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// JSON dump of the signed-in user's household (images stay in data/uploads).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const db = getDb();
  const h = user.householdId;

  const recipes = db.select().from(schema.recipes).where(eq(schema.recipes.householdId, h)).all();
  const recipeIds = recipes.map((r) => r.id);
  const mealPlans = db.select().from(schema.mealPlans).where(eq(schema.mealPlans.householdId, h)).all();
  const planIds = mealPlans.map((p) => p.id);

  const dump = {
    exportedAt: new Date().toISOString(),
    household: db.select().from(schema.households).where(eq(schema.households.id, h)).get(),
    // Accounts without password hashes.
    users: db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.householdId, h))
      .all(),
    recipes,
    ingredients: db.select().from(schema.ingredients).where(eq(schema.ingredients.householdId, h)).all(),
    recipeIngredients: db
      .select()
      .from(schema.recipeIngredients)
      .where(inArray(schema.recipeIngredients.recipeId, recipeIds))
      .all(),
    recipeSteps: db
      .select()
      .from(schema.recipeSteps)
      .where(inArray(schema.recipeSteps.recipeId, recipeIds))
      .all(),
    mealPlans,
    mealPlanEntries: db
      .select()
      .from(schema.mealPlanEntries)
      .where(inArray(schema.mealPlanEntries.planId, planIds))
      .all(),
    shoppingListItems: db
      .select()
      .from(schema.shoppingListItems)
      .where(inArray(schema.shoppingListItems.planId, planIds))
      .all(),
    batchSessions: db.select().from(schema.batchSessions).where(eq(schema.batchSessions.householdId, h)).all(),
    settings: db.select().from(schema.settings).where(eq(schema.settings.householdId, h)).all(),
  };
  const date = dump.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tesmenus-${date}.json"`,
    },
  });
}
