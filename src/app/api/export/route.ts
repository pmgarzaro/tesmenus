import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Full JSON dump of the database (images stay in data/uploads).
export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: "Non authentifié" }, { status: 401 });
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
    // Accounts without password hashes.
    users: db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .all(),
  };
  const date = dump.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tesmenus-${date}.json"`,
    },
  });
}
