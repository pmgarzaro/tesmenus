import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Temporary list to check the database; the full library comes in step 2.
export default async function RecipesPage() {
  const { householdId } = await requireUser();
  const recipes = getDb()
    .select({ id: schema.recipes.id, title: schema.recipes.title, tags: schema.recipes.tags })
    .from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId))
    .orderBy(asc(schema.recipes.title))
    .all();
  return (
    <>
      <PageHeader title="Recettes" />
      {recipes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-stone-500">
          Aucune recette. Chargez les exemples depuis les Réglages.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm">
          {recipes.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">{r.title}</span>
              <span className="text-xs text-stone-500">{r.tags.join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
