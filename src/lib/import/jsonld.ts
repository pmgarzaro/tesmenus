// schema.org/Recipe in JSON-LD: present on most recipe sites (Marmiton, 750g,
// Cuisine AZ, WordPress recipe plugins…). Free and reliable.
import { type HTMLElement, parse } from "node-html-parser";
import { type RawRecipe, parseIsoDuration } from "./build";

type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Decodes HTML entities and strips tags: "Cr&egrave;me <b>fraîche</b>" → "Crème fraîche". */
export function htmlToText(s: string): string {
  return parse(`<div>${s.replace(/<br\s*\/?>/gi, "\n")}</div>`).text.replace(/[ \t ]+/g, " ").trim();
}

const str = (v: Json): string | undefined => {
  if (typeof v === "string") return htmlToText(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return str(v[0]);
  if (isObj(v)) return str(v.name ?? v.text ?? v["@value"]);
  return undefined;
};

/** Array or single value → strings. `splitCommas` only for keyword lists. */
const list = (v: Json, splitCommas = false): string[] => {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.flatMap((x) => list(x, splitCommas));
  if (typeof v === "string") {
    const parts = splitCommas ? v.split(/,(?![^(]*\))/) : [v];
    return parts.map(htmlToText).filter(Boolean);
  }
  const s = str(v);
  return s ? [s] : [];
};

const isRecipe = (o: Obj) => {
  const t = o["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
};

function findRecipe(node: Json, depth = 0): Obj | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (isRecipe(node)) return node;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement"]) {
    if (node[key]) {
      const r = findRecipe(node[key], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** recipeInstructions: string, HowToStep[], HowToSection[] (nested), or mixed. */
function instructions(v: Json): string[] {
  if (v === undefined || v === null) return [];
  if (typeof v === "string") {
    return htmlToText(v.replace(/<\/(p|li)>/gi, "\n")).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap(instructions);
  if (isObj(v)) {
    if (v.itemListElement) return instructions(v.itemListElement); // HowToSection
    const text = str(v.text ?? v.name ?? v.description);
    return text ? [text] : [];
  }
  return [];
}

function parseJson(text: string): Json {
  try {
    return JSON.parse(text);
  } catch {
    // Some sites leave raw newlines/tabs inside strings.
    try {
      return JSON.parse(text.replace(/[\n\r\t]+/g, " "));
    } catch {
      return null;
    }
  }
}

export function extractJsonLdRecipe(html: string | HTMLElement): RawRecipe | null {
  const root = typeof html === "string" ? parse(html) : html;
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const recipe = findRecipe(parseJson(script.rawText));
    if (!recipe) continue;
    const ingredients = list(recipe.recipeIngredient ?? recipe.ingredients);
    const steps = instructions(recipe.recipeInstructions);
    return {
      title: str(recipe.name),
      description: str(recipe.description),
      servingsText: str(recipe.recipeYield),
      prepMinutes: parseIsoDuration(str(recipe.prepTime)),
      cookMinutes: parseIsoDuration(str(recipe.cookTime)),
      totalMinutes: parseIsoDuration(str(recipe.totalTime)),
      ingredientLines: ingredients,
      stepTexts: steps,
      categories: [
        ...list(recipe.recipeCategory, true),
        ...list(recipe.recipeCuisine, true),
        ...list(recipe.keywords, true),
      ],
    };
  }
  return null;
}
