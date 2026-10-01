import type { MEAL_TYPES } from "@/db/schema";
import { fold } from "./normalize";

export type RecipeSummary = {
  id: number;
  title: string;
  mealType: (typeof MEAL_TYPES)[number];
  tags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  freezable: boolean;
  servings: number;
  ingredientNames: string[];
};

export type RecipeFilters = {
  q?: string;
  tags?: string[];
  mealType?: (typeof MEAL_TYPES)[number];
  maxMinutes?: number;
  freezable?: boolean;
};

export const totalMinutes = (r: { prepMinutes: number | null; cookMinutes: number | null }) =>
  (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);

/**
 * In-memory search (a household has at most a few hundred recipes): every word
 * of the query must appear in the title, a tag or an ingredient, accents ignored.
 */
export function filterRecipes<T extends RecipeSummary>(recipes: T[], f: RecipeFilters): T[] {
  const words = fold(f.q ?? "").split(" ").filter(Boolean);
  return recipes.filter((r) => {
    if (f.mealType && r.mealType !== f.mealType) return false;
    if (f.freezable && !r.freezable) return false;
    if (f.maxMinutes && (totalMinutes(r) === 0 || totalMinutes(r) > f.maxMinutes)) return false;
    if (f.tags?.length && !f.tags.every((t) => r.tags.includes(t))) return false;
    if (words.length) {
      const haystack = fold([r.title, ...r.tags, ...r.ingredientNames].join(" "));
      if (!words.every((w) => haystack.includes(w))) return false;
    }
    return true;
  });
}

/** Tags of the library, most used first. */
export function tagCounts(recipes: RecipeSummary[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "fr"));
}
