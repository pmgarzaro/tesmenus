// Turns raw extracted recipe data (from JSON-LD, HTML or pasted text) into a
// form draft, with the fields worth checking flagged for the review screen.
import type { RecipeInput } from "@/lib/recipes/input";
import { fold, guessAisle, normalizeTags, parseIngredientLine } from "@/lib/recipes/normalize";
import { guessStep } from "@/lib/recipes/steps";

export type RawRecipe = {
  title?: string;
  description?: string;
  /** "4 personnes", "6", "Pour 4" */
  servingsText?: string;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  totalMinutes?: number | null;
  ingredientLines: string[];
  stepTexts: string[];
  /** recipeCategory / recipeCuisine / keywords */
  categories?: string[];
  sourceUrl?: string;
  /** OCR lines read with low confidence: matching ingredients/steps get flagged. */
  doubtfulLines?: string[];
};

/** "missing": nothing found, a default was used. "guess": deduced, to check. */
export type Flag = "missing" | "guess";
export type FieldFlags = {
  title?: Flag;
  servings?: Flag;
  prepMinutes?: Flag;
  cookMinutes?: Flag;
  mealType?: Flag;
  tags?: Flag;
  fridgeDays?: Flag;
  freezable?: Flag;
  ingredients?: Record<number, Flag>;
  steps?: Record<number, Flag>;
};

export type ImportMethod = "jsonld" | "html" | "text" | "photo" | "ai";
export type ImportResult = {
  draft: RecipeInput;
  flags: FieldFlags;
  warnings: string[];
  method: ImportMethod;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** ISO 8601 duration ("PT1H30M", "P0DT0H20M") → minutes. */
export function parseIsoDuration(s: string | undefined | null): number | null {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? Math.round(total) : null;
}

/** "1 h 30", "45 min", "1h", "20 minutes" → minutes. */
export function parseTextDuration(s: string): number | null {
  const t = fold(s);
  const hm = t.match(/(\d+)\s*h(?:eures?)?\s*(\d+)?/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const m = t.match(/(\d+)\s*(?:min|mn|minutes?)/);
  return m ? Number(m[1]) : null;
}

export function parseServings(s: string | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 100 ? n : null;
}

const MEAT = /boucherie/;
const DESSERT = /\b(dessert|gateau|tarte sucree|patisserie|gouter|cake|biscuit|cookie|sucre)\b/;
const STARTER = /\b(entree|aperitif|apero|amuse-bouche|tapas)\b/;
const MAIN = /\b(plat|plat principal|main|dinner|diner|dejeuner)\b/;
// Dishes that usually freeze well.
const FREEZABLE = /\b(soupe|veloute|mijote|curry|chili|bolognaise|ragout|daube|bourguignon|blanquette|lasagne|hachis|boulette|sauce|potage|tajine|gratin|quiche|cake)\b/;

function guessMealType(categories: string[]): { type: RecipeInput["mealType"]; flag?: Flag } {
  const c = fold(categories.join(" "));
  if (DESSERT.test(c)) return { type: "dessert" };
  if (STARTER.test(c)) return { type: "entree" };
  if (MAIN.test(c)) return { type: "plat" };
  return { type: "plat", flag: "guess" };
}

/** Keeps short, meaningful category/keyword tags. */
function categoryTags(categories: string[]): string[] {
  return normalizeTags(
    categories
      .flatMap((c) => c.split(","))
      .map(clean)
      .filter((t) => t.length >= 3 && t.length <= 20 && !/\d|recette|cuisine/i.test(t))
      // Already the "Type" field.
      .filter((t) => !/^(plat|plats|plat principal|plats principaux|entree|entrees|dessert|desserts|main course|dinner)$/.test(fold(t))),
  ).slice(0, 4);
}

export function buildDraft(raw: RawRecipe, method: ImportMethod): ImportResult {
  const flags: FieldFlags = {};
  const warnings: string[] = [];
  const doubtful = (raw.doubtfulLines ?? []).map((l) => fold(l));
  const isDoubtful = (text: string) => {
    const f = fold(text);
    return f.length > 2 && doubtful.some((d) => d.includes(f) || f.includes(d));
  };

  const title = clean(raw.title ?? "");
  if (!title) flags.title = "missing";

  let servings = parseServings(raw.servingsText);
  if (servings === null) {
    servings = 4;
    flags.servings = "missing";
  }

  let prep = raw.prepMinutes ?? null;
  let cook = raw.cookMinutes ?? null;
  if (raw.totalMinutes && prep !== null && cook === null && raw.totalMinutes > prep) cook = raw.totalMinutes - prep;
  if (raw.totalMinutes && prep === null && cook === null) {
    prep = raw.totalMinutes;
    flags.prepMinutes = "guess";
  }
  if (prep === null) flags.prepMinutes = "missing";
  if (cook === null) flags.cookMinutes = "missing";

  const ingredients: RecipeInput["ingredients"] = [];
  flags.ingredients = {};
  for (const line of raw.ingredientLines.map(clean).filter(Boolean)) {
    const p = parseIngredientLine(line);
    if (!p.label) continue;
    // A digit left in the name means the quantity was not understood.
    if (/^[^\p{L}]/u.test(p.label) || (p.quantity === null && /\d/.test(line)) || isDoubtful(line)) {
      flags.ingredients[ingredients.length] = "guess";
    }
    ingredients.push({
      quantity: p.quantity,
      unit: p.unit,
      label: p.label.slice(0, 200),
      aisle: null,
      optional: p.optional,
    });
  }
  if (ingredients.length === 0) warnings.push("Aucun ingrédient trouvé : à saisir à la main.");

  const steps: RecipeInput["steps"] = raw.stepTexts
    .map(clean)
    .filter(Boolean)
    .map((text) => ({ text: text.slice(0, 2000), ...guessStep(text) }));
  if (steps.length === 0) warnings.push("Aucune étape trouvée : à saisir à la main.");
  flags.steps = {};
  steps.forEach((s, i) => {
    if (isDoubtful(s.text)) flags.steps![i] = "guess";
  });
  if (raw.title && isDoubtful(raw.title)) flags.title = "guess";

  const categories = raw.categories ?? [];
  const meal = guessMealType([...categories, title]);
  if (meal.flag) flags.mealType = meal.flag;

  // Protein tag (used by the planning for variety) from the ingredients' aisles.
  const aisles = ingredients.map((i) => guessAisle(i.label));
  const protein = aisles.some((a) => MEAT.test(a))
    ? "viande"
    : aisles.includes("poissonnerie")
      ? "poisson"
      : meal.type === "plat"
        ? "végé"
        : null;
  const total = (prep ?? 0) + (cook ?? 0);
  const tags = normalizeTags([
    ...(protein ? [protein] : []),
    ...(total > 0 && total <= 30 ? ["rapide"] : []),
    ...(steps.some((s) => s.equipment === "four") ? ["four"] : []),
    ...categoryTags(categories),
  ]);
  if (tags.length) flags.tags = "guess";

  // Conservation: cautious defaults, always to check.
  const fridgeDays = protein === "poisson" ? 2 : 3;
  flags.fridgeDays = "guess";
  const freezable = FREEZABLE.test(fold(title));
  flags.freezable = "guess";

  if (Object.keys(flags.ingredients).length === 0) delete flags.ingredients;
  if (Object.keys(flags.steps).length === 0) delete flags.steps;

  return {
    draft: {
      title: title.slice(0, 200),
      description: raw.description ? clean(raw.description).slice(0, 2000) || null : null,
      servings,
      prepMinutes: prep,
      cookMinutes: cook,
      mealType: meal.type,
      tags,
      sourceUrl: raw.sourceUrl ?? null,
      notes: null,
      fridgeDays,
      freezable,
      ingredients,
      steps,
    },
    flags,
    warnings,
    method,
  };
}
