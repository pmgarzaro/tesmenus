// Weekly meal plan generation: deterministic (seeded) and testable, no LLM.
import type { SLOTS } from "@/db/schema";
import { fold } from "@/lib/recipes/normalize";
import { addDays, dateRange, shortDate } from "./dates";

export type Slot = (typeof SLOTS)[number];

export type PlannerRecipe = {
  id: number;
  title: string;
  tags: string[];
  mealType: "entree" | "plat" | "dessert" | "autre";
  totalMinutes: number; // 0 = unknown
  freezable: boolean;
  ingredientNames: string[];
};

export type PlanConstraints = {
  /** Max total time (prep + cooking) by date, for the meals cooked that day. */
  maxMinutesByDate?: Record<string, number>;
  /** Recipes that must appear. */
  include?: number[];
  onlyFreezable?: boolean;
  /** Recipes with any of these tags are left out. */
  excludeTags?: string[];
};

export type PlanOptions = {
  startDate: string;
  days: number;
  slots: Slot[];
  people: number;
  servingsPerRecipe: number;
  dinnerCoversNextLunch: boolean;
  constraints?: PlanConstraints;
  /** Recipes eaten the week before: avoided if possible. */
  recentRecipeIds?: number[];
  /** Cooking cells already decided ("date|slot" → recipe id or null for eating out / empty). */
  fixed?: Record<string, number | null>;
  /** Recipes not to pick (e.g. the one being replaced). */
  avoid?: number[];
  seed?: number;
};

export type PlanEntry = {
  date: string;
  slot: Slot;
  recipeId: number | null;
  servings: number | null;
  /** Eats the leftovers of the cooking entry at `sourceKey`. */
  isLeftover: boolean;
  sourceKey: string | null;
};

export type GeneratedPlan = { entries: PlanEntry[]; warnings: string[] };

export const cellKey = (date: string, slot: Slot) => `${date}|${slot}`;

// Pantry staples do not count as "shared ingredients".
const STAPLES = new Set(
  ["sel", "poivre", "huile d'olive", "huile", "eau", "sucre", "farine", "beurre", "ail", "oignon", "bouillon de legumes"].map(fold),
);

const PROTEINS: [string, RegExp][] = [
  ["poisson", /\b(poisson|fruits de mer)\b/],
  ["viande", /\b(viande|boeuf|porc|poulet|volaille|agneau|veau)\b/],
  ["végé", /\b(vege|vegetarien|vegan|vegetalien)\b/],
];

/** Protein family from the tags, used to alternate meat / fish / veggie. */
export function proteinOf(r: PlannerRecipe): string {
  const tags = fold(r.tags.join(" "));
  return PROTEINS.find(([, re]) => re.test(tags))?.[0] ?? "autre";
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CookSlot = { key: string; date: string; slot: Slot; servings: number; leftoverKey: string | null };

/** Which cells are cooked and which eat leftovers. */
export function layout(o: PlanOptions): { cooks: CookSlot[]; leftovers: Map<string, string> } {
  const dates = dateRange(o.startDate, o.days);
  const withLeftovers = o.dinnerCoversNextLunch && o.slots.includes("midi") && o.slots.includes("soir");
  const leftovers = new Map<string, string>(); // lunch key → dinner key
  const cooks: CookSlot[] = [];
  for (const [i, date] of dates.entries()) {
    for (const slot of (["midi", "soir"] as const).filter((s) => o.slots.includes(s))) {
      const key = cellKey(date, slot);
      if (withLeftovers && slot === "midi" && i > 0) {
        leftovers.set(key, cellKey(addDays(date, -1), "soir"));
        continue;
      }
      const leftoverKey = withLeftovers && slot === "soir" && i < dates.length - 1 ? cellKey(addDays(date, 1), "midi") : null;
      cooks.push({ key, date, slot, servings: leftoverKey ? o.servingsPerRecipe : o.people, leftoverKey });
    }
  }
  return { cooks, leftovers };
}

function eligible(r: PlannerRecipe, c: PlanConstraints): boolean {
  if (r.mealType === "dessert" || r.mealType === "entree") return false;
  if (c.onlyFreezable && !r.freezable) return false;
  if (c.excludeTags?.length && r.tags.some((t) => c.excludeTags!.includes(t))) return false;
  return true;
}

const fitsTime = (r: PlannerRecipe, max: number | undefined) => !max || (r.totalMinutes > 0 && r.totalMinutes <= max);

function sharedIngredients(r: PlannerRecipe, chosen: PlannerRecipe[]): number {
  const mine = new Set(r.ingredientNames.map(fold).filter((n) => !STAPLES.has(n)));
  let n = 0;
  for (const other of chosen) for (const name of other.ingredientNames) if (mine.has(fold(name))) n++;
  return n;
}

/** Score of putting `r` after `previous` given what is already `chosen` (higher is better). */
function score(r: PlannerRecipe, previous: PlannerRecipe | undefined, chosen: PlannerRecipe[], recent: Set<number>) {
  let s = 0;
  if (recent.has(r.id)) s -= 40;
  const family = proteinOf(r);
  if (previous && proteinOf(previous) === family) s -= 15;
  s -= 6 * chosen.filter((c) => proteinOf(c) === family).length;
  if (previous) s -= 3 * r.tags.filter((t) => previous.tags.includes(t)).length;
  s += Math.min(2 * sharedIngredients(r, chosen), 10);
  return s;
}

function attempt(o: PlanOptions, pool: PlannerRecipe[], cooks: CookSlot[], random: () => number) {
  const c = o.constraints ?? {};
  const byId = new Map(pool.map((r) => [r.id, r]));
  const recent = new Set(o.recentRecipeIds ?? []);
  const avoid = new Set(o.avoid ?? []);
  const assigned = new Map<string, number | null>();
  const used = new Set<number>();
  const warnings: string[] = [];
  let total = 0;

  for (const [key, id] of Object.entries(o.fixed ?? {})) {
    if (!cooks.some((s) => s.key === key)) continue;
    assigned.set(key, id);
    if (id !== null) used.add(id);
  }

  // Included recipes first, in the first free slot where they fit.
  for (const id of c.include ?? []) {
    const r = byId.get(id);
    if (!r || used.has(id)) continue;
    const slot = cooks.find((s) => !assigned.has(s.key) && fitsTime(r, c.maxMinutesByDate?.[s.date]));
    if (slot) {
      assigned.set(slot.key, id);
      used.add(id);
    } else warnings.push(`« ${r.title} » n'a pas trouvé de place (temps maximum).`);
  }

  let previous: PlannerRecipe | undefined;
  for (const s of cooks) {
    if (assigned.has(s.key)) {
      const id = assigned.get(s.key);
      previous = id ? byId.get(id) : previous;
      continue;
    }
    const max = c.maxMinutesByDate?.[s.date];
    const chosen = [...used].map((id) => byId.get(id)!).filter(Boolean);
    let candidates = pool.filter((r) => !used.has(r.id) && !avoid.has(r.id) && fitsTime(r, max));
    let penalty = 0;
    if (candidates.length === 0) {
      // Not enough recipes: allow a repeat rather than an empty meal.
      candidates = pool.filter((r) => !avoid.has(r.id) && fitsTime(r, max));
      penalty = 100;
    }
    if (candidates.length === 0) {
      assigned.set(s.key, null);
      warnings.push(max ? `Aucune recette en ${max} min ou moins pour ${shortDate(s.date)} ${s.slot}.` : "Pas assez de recettes.");
      continue;
    }
    const scored = candidates.map((r) => ({
      r,
      s: score(r, previous, chosen, recent) - (used.has(r.id) ? penalty : 0) + random() * 12,
    }));
    scored.sort((a, b) => b.s - a.s);
    const best = scored[0];
    assigned.set(s.key, best.r.id);
    used.add(best.r.id);
    total += best.s;
    previous = best.r;
  }
  return { assigned, warnings, total };
}

export function generatePlan(o: PlanOptions, recipes: PlannerRecipe[]): GeneratedPlan {
  const c = o.constraints ?? {};
  const pool = recipes.filter((r) => eligible(r, c));
  const { cooks, leftovers } = layout(o);
  const random = rng(o.seed ?? 1);

  // A few randomised greedy passes; keep the best.
  let best: ReturnType<typeof attempt> | null = null;
  for (let i = 0; i < 25; i++) {
    const a = attempt(o, pool, cooks, random);
    if (!best || a.total > best.total) best = a;
  }
  const { assigned, warnings } = best!;
  if (pool.length === 0) warnings.unshift("Aucune recette ne correspond aux contraintes.");

  const entries: PlanEntry[] = [];
  for (const date of dateRange(o.startDate, o.days)) {
    for (const slot of (["midi", "soir"] as const).filter((s) => o.slots.includes(s))) {
      const key = cellKey(date, slot);
      const source = leftovers.get(key);
      if (source) {
        const fromRecipe = assigned.get(source) ?? null;
        entries.push({ date, slot, recipeId: null, servings: null, isLeftover: fromRecipe !== null, sourceKey: fromRecipe !== null ? source : null });
        continue;
      }
      const cook = cooks.find((s) => s.key === key)!;
      entries.push({ date, slot, recipeId: assigned.get(key) ?? null, servings: cook.servings, isLeftover: false, sourceKey: null });
    }
  }
  return { entries, warnings: [...new Set(warnings)] };
}
