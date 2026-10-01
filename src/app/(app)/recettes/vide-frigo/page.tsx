import { eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { FridgeFinder } from "@/components/recipes/FridgeFinder";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { listFridgeRecipes } from "@/lib/recipes/repo";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function FridgePage() {
  const { householdId } = await requireUser();
  const suggestions = getDb()
    .select({ name: schema.ingredients.name })
    .from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId))
    .all()
    .map((i) => i.name)
    .sort((a, b) => a.localeCompare(b, "fr"));
  return (
    <>
      <Link href="/recettes" className="text-sm text-stone-500">← Recettes</Link>
      <PageHeader title="🧊 Vide-frigo" />
      <p className="mb-3 text-sm text-stone-600">Indique ce qu&apos;il te reste : l&apos;appli trouve les recettes de ta bibliothèque que tu peux faire.</p>
      <FridgeFinder recipes={listFridgeRecipes(householdId)} suggestions={suggestions} pantry={getSettings(householdId).pantry} />
    </>
  );
}
