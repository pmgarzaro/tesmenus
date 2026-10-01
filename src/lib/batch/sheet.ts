// Batch cooking sheet: mise en place, totals, timeline, conservation (no LLM).
import { addDays, shortDate } from "@/lib/planning/dates";
import { fold } from "@/lib/recipes/normalize";
import { type Unit, formatIngredientLine } from "@/lib/recipes/units";
import { type NeedLine, aggregate, formatItemAmounts } from "@/lib/shopping/aggregate";
import { type BatchStep, type TimelineTask, missingSteps, scheduleBatch } from "./schedule";

export type BatchDish = {
  key: string;
  recipeId: number;
  title: string;
  tags: string[];
  recipeServings: number;
  servings: number;
  fridgeDays: number | null;
  freezable: boolean;
  ingredients: {
    ingredientId: number;
    name: string;
    label: string;
    aisle: NeedLine["aisle"];
    quantity: number | null;
    unit: Unit | null;
    optional: boolean;
  }[];
  steps: BatchStep[];
  /** Days the dish is eaten (from the plan); empty for a library recipe. */
  eatDates: string[];
};

export type MiseEnPlace = { verb: string; ingredient: string; total: string; parts: { recipe: string; amount: string }[] };

export type Conservation = {
  key: string;
  title: string;
  fridgeDays: number;
  /** "frigo" for everything, "mixte" (some portions frozen), "congelateur", or "attention". */
  storage: "frigo" | "mixte" | "congelateur" | "attention";
  advice: string[];
  reheating: string;
  firstEat: string | null;
};

export type BatchSheet = {
  sessionDate: string;
  dishes: { key: string; recipeId: number; title: string; servings: number; eatDates: string[] }[];
  miseEnPlace: MiseEnPlace[];
  ingredients: { name: string; aisle: NeedLine["aisle"]; amount: string }[];
  timeline: TimelineTask[];
  totalMinutes: number;
  separateMinutes: number;
  conservation: Conservation[];
  warnings: string[];
};

// Cutting and basic preparation verbs (folded stem → infinitive).
const VERBS: [RegExp, string][] = [
  [/\bemin[cç]/, "Émincer"],
  [/\bcisel/, "Ciseler"],
  [/\bhach/, "Hacher"],
  [/\bdetaill/, "Détailler"],
  [/\bcoup/, "Couper"],
  [/\btaill/, "Tailler"],
  [/\beplu/, "Éplucher"],
  [/\bpel/, "Peler"],
  [/\brap/, "Râper"],
  [/\bpress/, "Presser"],
  [/\bzest/, "Zester"],
  [/\blav/, "Laver"],
  [/\begoutt/, "Égoutter"],
  [/\brinc/, "Rincer"],
];

/** Words by which an ingredient may appear in a step ("oignons", "l'ail", "pommes de terre"). */
function mentions(text: string, name: string, label: string): number {
  const t = ` ${fold(text).replace(/[^a-z0-9' -]/g, " ")} `;
  const variants = new Set<string>();
  for (const n of [name, label]) {
    const f = fold(n);
    variants.add(f);
    variants.add(f.replace(/s\b/g, "")); // singular words
    const first = f.split(" ")[0];
    if (first.length >= 4) variants.add(first.replace(/s$/, ""));
  }
  let best = -1;
  for (const v of variants) {
    if (v.length < 3) continue;
    const m = t.search(new RegExp(`[ ']${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    if (m >= 0 && (best === -1 || m < best)) best = m;
  }
  return best;
}

function miseEnPlace(dishes: BatchDish[]): MiseEnPlace[] {
  type Acc = { verb: string; ingredientId: number; ingredient: string; lines: NeedLine[]; parts: { recipe: string; amount: string }[] };
  const groups = new Map<string, Acc>();
  for (const d of dishes) {
    const factor = d.servings / d.recipeServings;
    for (const step of d.steps.filter((s) => s.type === "preparation")) {
      const folded = ` ${fold(step.text)}`;
      const verbs = VERBS.flatMap(([re, verb]) => [...folded.matchAll(new RegExp(re.source, "g"))].map((m) => ({ at: m.index!, verb })));
      if (verbs.length === 0) continue;
      for (const ing of d.ingredients) {
        const at = mentions(step.text, ing.name, ing.label);
        if (at < 0) continue;
        const verb = verbs.filter((v) => v.at <= at).sort((a, b) => b.at - a.at)[0]?.verb;
        if (!verb) continue;
        const key = `${verb}|${ing.ingredientId}`;
        const acc = groups.get(key) ?? { verb, ingredientId: ing.ingredientId, ingredient: ing.name, lines: [], parts: [] };
        if (acc.parts.some((p) => p.recipe === d.title)) continue;
        const quantity = ing.quantity === null ? null : ing.quantity * factor;
        acc.lines.push({ ...ing, quantity, recipe: d.title });
        acc.parts.push({ recipe: d.title, amount: formatIngredientLine(quantity, ing.unit, ing.label) });
        groups.set(key, acc);
      }
    }
  }
  return [...groups.values()]
    .map((g) => ({
      verb: g.verb,
      ingredient: g.ingredient,
      total: formatItemAmounts(aggregate(g.lines)[0]),
      parts: g.parts,
    }))
    .sort((a, b) => a.ingredient.localeCompare(b.ingredient, "fr") || a.verb.localeCompare(b.verb, "fr"));
}

const FISH = /\b(poisson|saumon|cabillaud|thon|crevette|moule|fruits de mer|colin|merlu|truite|sardine)\b/;
const MEAT = /\b(viande|boeuf|porc|poulet|volaille|dinde|agneau|veau|canard|lardon|jambon|saucisse|chili|bolognaise)\b/;

/** Prudent fridge limit: fish 2 days, meat 3, the rest 4 (and never above the recipe's own value). */
export function fridgeLimit(d: Pick<BatchDish, "title" | "tags" | "fridgeDays" | "ingredients">): number {
  const words = fold([d.title, ...d.tags, ...d.ingredients.map((i) => i.name)].join(" "));
  const cap = FISH.test(words) ? 2 : MEAT.test(words) ? 3 : 4;
  return Math.max(1, Math.min(d.fridgeDays ?? 3, cap));
}

function reheating(d: BatchDish): string {
  const t = fold([d.title, ...d.tags].join(" "));
  const oven = d.steps.some((s) => s.equipment === "four");
  if (FISH.test(t)) return "Réchauffer doucement (micro-ondes puissance moyenne, couvert) sans trop cuire ; aussi bon froid pour certains plats.";
  if (/\b(soupe|veloute|potage)\b/.test(t)) return "Casserole à feu doux en remuant, jusqu'à frémissement.";
  if (/\b(gratin|quiche|tarte|lasagne|hachis)\b/.test(t) || oven) {
    return "Four à 160 °C, couvert d'aluminium, 15 à 20 min (ou micro-ondes pour une part).";
  }
  if (/\b(mijote|curry|chili|bolognaise|sauce|ragout|daube|bourguignon)\b/.test(t)) {
    return "Casserole à feu doux avec un filet d'eau, en remuant, jusqu'à bien chaud.";
  }
  return "Réchauffer jusqu'à ce que ce soit bien chaud à cœur.";
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

function conservation(d: BatchDish, sessionDate: string): Conservation {
  const limit = fridgeLimit(d);
  const advice: string[] = [];
  const dates = [...new Set(d.eatDates)].sort();
  let storage: Conservation["storage"] = "frigo";

  if (dates.length === 0) {
    advice.push(`Frigo : ${limit} jour${limit > 1 ? "s" : ""} maximum (jusqu'au ${shortDate(addDays(sessionDate, limit))}).`);
    if (d.freezable) advice.push("Ou congélateur dès refroidissement : jusqu'à 3 mois.");
  } else {
    const late = dates.filter((x) => daysBetween(sessionDate, x) > limit);
    const ok = dates.filter((x) => !late.includes(x));
    if (ok.length) advice.push(`Frigo pour ${ok.map(shortDate).join(", ")} (${limit} jours maximum).`);
    if (late.length) {
      if (d.freezable) {
        storage = ok.length ? "mixte" : "congelateur";
        for (const x of late) {
          advice.push(`Congeler la portion du ${shortDate(x)} dès refroidissement ; la sortir au frigo la veille (${shortDate(addDays(x, -1))}).`);
        }
      } else {
        storage = "attention";
        advice.push(
          `⚠️ Ne se congèle pas et se garde ${limit} jours : la portion du ${late.map(shortDate).join(", ")} serait trop tard. Cuisine-la plus près de la date ou change le planning.`,
        );
      }
    }
  }
  advice.push("Refroidir rapidement (moins de 2 h à température ambiante), boîtes fermées et datées.");
  return { key: d.key, title: d.title, fridgeDays: limit, storage, advice, reheating: reheating(d), firstEat: dates[0] ?? null };
}

export function buildSheet(dishes: BatchDish[], sessionDate: string): BatchSheet {
  const recipes = dishes.map((d) => ({ key: d.key, title: d.title, steps: d.steps }));
  const schedule = scheduleBatch(recipes);
  const warnings: string[] = [];
  const missing = missingSteps(recipes, schedule);
  if (missing.length) warnings.push(`${missing.length} étape(s) absente(s) de la timeline : vérifie les recettes.`);
  for (const d of dishes) if (d.steps.length === 0) warnings.push(`« ${d.title} » n'a pas d'étapes : à ajouter dans la recette.`);
  const estimated = schedule.tasks.filter((t) => t.estimated).length;
  if (estimated) warnings.push(`${estimated} étape(s) sans durée : durée estimée, la timeline est approximative.`);

  const lines: NeedLine[] = dishes.flatMap((d) =>
    d.ingredients.map((i) => ({
      ...i,
      quantity: i.quantity === null ? null : (i.quantity * d.servings) / d.recipeServings,
      recipe: d.title,
    })),
  );

  const conservations = dishes
    .map((d) => conservation(d, sessionDate))
    .sort((a, b) => (a.firstEat ?? "9999").localeCompare(b.firstEat ?? "9999") || a.fridgeDays - b.fridgeDays);
  for (const c of conservations) if (c.storage === "attention") warnings.push(`« ${c.title} » : conservation trop courte pour la date prévue.`);

  return {
    sessionDate,
    dishes: dishes.map((d) => ({ key: d.key, recipeId: d.recipeId, title: d.title, servings: d.servings, eatDates: d.eatDates })),
    miseEnPlace: miseEnPlace(dishes),
    ingredients: aggregate(lines).map((i) => ({ name: i.name, aisle: i.aisle, amount: formatItemAmounts(i) })),
    timeline: schedule.tasks,
    totalMinutes: schedule.totalMinutes,
    separateMinutes: schedule.separateMinutes,
    conservation: conservations,
    warnings,
  };
}
