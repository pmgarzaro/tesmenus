import { Refrigerator, Snowflake } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AddRecipeButton } from "@/components/recipes/AddRecipeButton";
import { LibraryFilters } from "@/components/recipes/LibraryFilters";
import { MEAL_TYPES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatMinutes } from "@/lib/labels";
import { noteForTags, tiltAt } from "@/lib/notes";
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
              <Refrigerator className="mr-1 inline size-4 align-[-3px]" aria-hidden />
              Vide-frigo
            </Link>
          )
        }
      />
      {all.length === 0 ? (
        <div className="postit note-yellow magnet magnet-red tilt-l space-y-3 p-6 pt-7 text-center text-stone-700">
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
            <ul className="grid grid-cols-2 gap-x-3 gap-y-5 pt-2 sm:grid-cols-3">
              {recipes.map((r, i) => {
                const style = noteForTags(r.tags, r.mealType);
                return (
                  <li key={r.id} className="min-w-0">
                    <Link
                      href={`/recettes/${r.id}`}
                      className={`postit magnet ${style.note} ${style.magnet} ${tiltAt(i)} flex min-h-28 flex-col justify-between gap-2 px-3 pb-2.5 pt-4 transition-transform active:scale-[0.98]`}
                    >
                      <span className="font-hand text-[1.45rem] font-bold leading-[1.05] [overflow-wrap:anywhere]">{r.title}</span>
                      <span className="flex items-end justify-between gap-1 text-xs text-stone-600">
                        <span className="min-w-0 truncate">{r.tags.slice(0, 2).join(" · ")}</span>
                        <span className="shrink-0 font-medium">
                          {formatMinutes(totalMinutes(r))}
                          {r.freezable && <Snowflake className="ml-1 inline size-3.5 align-[-2px] text-sky-600" aria-label="congelable" />}
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
