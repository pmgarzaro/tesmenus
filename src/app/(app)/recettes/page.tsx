import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AddRecipeButton } from "@/components/recipes/AddRecipeButton";
import { LibraryFilters } from "@/components/recipes/LibraryFilters";
import { MEAL_TYPES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatMinutes } from "@/lib/labels";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { type RecipeFilters, filterRecipes, tagCounts, totalMinutes } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

type Search = { q?: string; tag?: string | string[]; type?: string; max?: string; congelable?: string };

function parseFilters(s: Search): RecipeFilters {
  return {
    q: s.q,
    tags: s.tag === undefined ? [] : [s.tag].flat(),
    mealType: MEAL_TYPES.find((t) => t === s.type),
    maxMinutes: Number(s.max) || undefined,
    freezable: s.congelable === "1",
  };
}

export default async function RecipesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { householdId } = await requireUser();
  const all = listRecipeSummaries(householdId);
  const recipes = filterRecipes(all, parseFilters(await searchParams));
  const tags = tagCounts(all).map((t) => t.tag);

  return (
    <>
      <PageHeader
        title="Recettes"
        action={
          all.length > 0 && (
            <Link href="/recettes/vide-frigo" className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm">
              🧊 Vide-frigo
            </Link>
          )
        }
      />
      {all.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-500">
          <p>Ta bibliothèque est vide.</p>
          <p>
            Ajoute une recette avec le bouton <strong>+</strong>, ou charge les exemples depuis les{" "}
            <Link href="/reglages" className="text-brand-700 underline">Réglages</Link>.
          </p>
        </div>
      ) : (
        <>
          <Suspense>
            <LibraryFilters tags={tags} />
          </Suspense>
          {recipes.length === 0 ? (
            <p className="p-6 text-center text-stone-500">Aucune recette ne correspond.</p>
          ) : (
            <ul className="space-y-2">
              {recipes.map((r) => (
                <li key={r.id}>
                  <Link href={`/recettes/${r.id}`} className="block rounded-2xl bg-white px-4 py-3 shadow-sm active:bg-stone-50">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{r.title}</span>
                      <span className="shrink-0 text-sm text-stone-500">
                        {formatMinutes(totalMinutes(r))}
                        {r.freezable && " · ❄️"}
                      </span>
                    </div>
                    {r.tags.length > 0 && <p className="mt-0.5 text-xs text-stone-500">{r.tags.join(" · ")}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <AddRecipeButton />
    </>
  );
}
