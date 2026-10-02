import { Refrigerator, Snowflake } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AddRecipeButton } from "@/components/recipes/AddRecipeButton";
import { LibraryFilters } from "@/components/recipes/LibraryFilters";
import { MEAL_TYPES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatMinutes } from "@/lib/labels";
import { magnetForTags } from "@/lib/notes";
import { kcalPerServingByRecipe } from "@/lib/nutrition/repo";
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
  const kcal = kcalPerServingByRecipe(householdId);

  return (
    <>
      <PageHeader
        title="Recettes"
        action={
          all.length > 0 && (
            <Link href="/recettes/vide-frigo" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 font-display font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
              <Refrigerator className="size-4" aria-hidden />
              Vide-frigo
            </Link>
          )
        }
      />
      {all.length === 0 ? (
        <div className="paper space-y-3 p-6 text-center text-stone-700">
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
            <ul className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
              {recipes.map((r) => {
                const magnet = magnetForTags(r.tags, r.mealType);
                return (
                  <li key={r.id} className="min-w-0">
                    <Link
                      href={`/recettes/${r.id}`}
                      className="paper flex h-full min-h-28 gap-2.5 p-3 transition-transform active:scale-[0.98]"
                    >
                      <span aria-hidden="true" className={`magnet-letter ${magnet} w-7 shrink-0 -rotate-6 text-[2.1rem] uppercase`}>
                        {r.title.charAt(0)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                        <span className="flex flex-col gap-0.5">
                          <span className="font-extrabold leading-tight [overflow-wrap:anywhere]">{r.title}</span>
                          {kcal.has(r.id) && (
                            <span className="text-xs text-stone-600">≈ {Math.round(kcal.get(r.id)!)} kcal / portion</span>
                          )}
                        </span>
                        <span className="flex items-end justify-between gap-1 text-xs text-stone-600">
                          <span className="min-w-0 truncate">{r.tags.slice(0, 2).join(" · ")}</span>
                          <span className="flex shrink-0 items-center gap-1 font-semibold">
                            {formatMinutes(totalMinutes(r))}
                            {r.freezable && (
                              <Snowflake className="size-3.5 text-magnet-blue-dark" strokeWidth={2.2} aria-label="congelable" />
                            )}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <AddRecipeButton />
    </>
  );
}
