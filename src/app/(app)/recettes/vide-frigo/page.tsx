import { BackLink } from "@/components/BackLink";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { FridgeFinder } from "@/components/recipes/FridgeFinder";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { listFridgeRecipes } from "@/lib/recipes/repo";
import { getSettings } from "@/lib/settings";
import { listStock } from "@/lib/stock/repo";

export const dynamic = "force-dynamic";

export default async function FridgePage({ searchParams }: { searchParams: Promise<{ stock?: string }> }) {
  const { householdId } = await requireUser();
  // What is in stock and still good, soonest date first (most urgent to use).
  const stock = [...new Set(listStock(householdId).filter((i) => i.status !== "perime").map((i) => i.name))];
  const fromStock = (await searchParams).stock === "1";
  const suggestions = getDb()
    .select({ name: schema.ingredients.name })
    .from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId))
    .all()
    .map((i) => i.name)
    .sort((a, b) => a.localeCompare(b, "fr"));
  return (
    <>
      {fromStock ? <BackLink href="/stock">Stock</BackLink> : <BackLink href="/recettes">Recettes</BackLink>}
      <PageHeader title="Vide-frigo" />
      <p className="mb-3 text-sm text-stone-600">Indique ce qu&apos;il te reste : l&apos;appli trouve les recettes de ta bibliothèque que tu peux faire.</p>
      <FridgeFinder
        recipes={listFridgeRecipes(householdId)}
        suggestions={suggestions}
        pantry={getSettings(householdId).pantry}
        stock={stock}
        initial={fromStock ? stock : []}
      />
    </>
  );
}
