// "Vide-frigo": which recipes can I make with what I have? (no AI needed)
import { fold, ingredientKey } from "./normalize";

export type FridgeRecipe = {
  id: number;
  title: string;
  minutes: number;
  ingredients: { name: string; optional: boolean }[];
};

export type FridgeMatch = {
  id: number;
  title: string;
  minutes: number;
  /** Share of the needed ingredients you have, 0-100. */
  score: number;
  have: string[];
  missing: string[];
};

// Always assumed at home, on top of the household's pantry list.
const BASICS = ["sel", "poivre", "eau", "huile", "huile d'olive"];

/** "poulet" matches "blanc de poulet" and "poulet fermier"; "oignons" matches "oignon". */
function matches(owned: string[], ingredient: string): boolean {
  const key = ingredientKey(ingredient);
  return owned.some((o) => o === key || ` ${key} `.includes(` ${o} `) || ` ${o} `.includes(` ${key} `));
}

export function matchFridge(recipes: FridgeRecipe[], owned: string[], pantry: string[] = []): FridgeMatch[] {
  const have = owned.map(ingredientKey).filter(Boolean);
  if (have.length === 0) return [];
  const always = [...BASICS, ...pantry].map((p) => fold(p));
  return recipes
    .map((r) => {
      const needed = r.ingredients.filter((i) => !i.optional && !always.includes(ingredientKey(i.name)));
      const got = needed.filter((i) => matches(have, i.name));
      return {
        id: r.id,
        title: r.title,
        minutes: r.minutes,
        score: needed.length ? Math.round((got.length / needed.length) * 100) : 0,
        have: got.map((i) => i.name),
        missing: needed.filter((i) => !got.includes(i)).map((i) => i.name),
      };
    })
    .filter((m) => m.have.length > 0)
    .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length || (a.minutes || 999) - (b.minutes || 999));
}
