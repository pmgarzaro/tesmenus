// Read models returned by the MCP tools. Plain functions over the app's
// existing services (recipes, planning, journal) so they can be tested
// without the MCP transport.
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { recipeNutrition } from "@/lib/nutrition/repo";
import { getRecipe, listRecipeSummaries } from "@/lib/recipes/repo";
import { filterRecipes } from "@/lib/recipes/search";
import { type Unit, roundForKitchen, scaleQuantity } from "@/lib/recipes/units";
import { getSettings } from "@/lib/settings";
import { type LogEntry, type Owner, type Targets, listLog } from "@/lib/journal/repo";

/** Units as a person would write them (pieces have none). */
const UNIT_NAMES: Record<Unit, string | null> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  cl: "cl",
  l: "l",
  piece: null,
  cas: "c. à soupe",
  cac: "c. à café",
  pincee: "pincée",
  botte: "botte",
  gousse: "gousse",
  boite: "boîte",
  tranche: "tranche",
  sachet: "sachet",
};

const PLAN_SLOTS = { midi: "lunch", soir: "dinner" } as const;

// ---------------------------------------------------------------------------
// Planning

export type PlannedMeal = {
  slot: "lunch" | "dinner";
  recipe_id: number | null;
  recipe_name: string | null;
  /** Portions cooked for the whole household (null for leftovers / eating out). */
  servings_planned: number | null;
  is_leftover: boolean;
  leftover_of: { date: string; slot: "lunch" | "dinner" } | null;
  is_eating_out: boolean;
};

export function plannedMeals(owner: Owner, date: string) {
  const db = getDb();
  // Several plans may cover the same day: the most recent one wins.
  const rows = db
    .select({ entry: schema.mealPlanEntries })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.mealPlans, eq(schema.mealPlans.id, schema.mealPlanEntries.planId))
    .where(and(eq(schema.mealPlans.householdId, owner.householdId), eq(schema.mealPlanEntries.date, date)))
    .orderBy(desc(schema.mealPlans.id))
    .all();
  const bySlot = new Map<string, (typeof rows)[number]["entry"]>();
  for (const { entry } of rows) if (!bySlot.has(entry.slot)) bySlot.set(entry.slot, entry);

  const meals: PlannedMeal[] = [];
  for (const slot of ["midi", "soir"] as const) {
    const e = bySlot.get(slot);
    if (!e) continue;
    const source = e.isLeftover && e.sourceEntryId
      ? db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, e.sourceEntryId)).get()
      : undefined;
    const recipeId = e.isLeftover ? source?.recipeId ?? null : e.recipeId;
    const recipe = recipeId
      ? db
          .select({ title: schema.recipes.title })
          .from(schema.recipes)
          .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, owner.householdId)))
          .get()
      : undefined;
    if (!recipe && !e.isEatingOut) continue; // empty cell
    meals.push({
      slot: PLAN_SLOTS[slot],
      recipe_id: recipe ? recipeId : null,
      recipe_name: recipe?.title ?? null,
      servings_planned: e.isLeftover || e.isEatingOut ? null : e.servings,
      is_leftover: e.isLeftover,
      leftover_of: source ? { date: source.date, slot: PLAN_SLOTS[source.slot] } : null,
      is_eating_out: e.isEatingOut,
    });
  }
  return { date, people_in_household: getSettings(owner.householdId).people, meals };
}

// ---------------------------------------------------------------------------
// Recipes

export type Quantity = { amount: number | null; unit: string | null; name: string; optional?: boolean };

export function recipeView(owner: Owner, recipeId: number, servings?: number, includeSteps = false) {
  const r = getRecipe(owner.householdId, recipeId);
  if (!r) return null;
  const target = servings ?? r.servings;
  const ingredients: Quantity[] = r.ingredients.map((i) => {
    const scaled = scaleQuantity(i.quantity, r.servings, target);
    return {
      // Rounded exactly like the recipe page shows it.
      amount: scaled === null ? null : roundForKitchen(scaled, i.unit),
      unit: i.unit ? UNIT_NAMES[i.unit] : null,
      name: i.label,
      ...(i.optional ? { optional: true } : {}),
    };
  });
  const n = recipeNutrition(r);
  const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    id: r.id,
    name: r.title,
    base_servings: r.servings,
    servings: target,
    tags: r.tags,
    prep_min: r.prepMinutes,
    cook_min: r.cookMinutes,
    ingredients,
    steps: includeSteps ? r.steps.map((s) => s.text) : null,
    // The app's own estimate from its ingredient table, for one serving.
    // coverage < 1 means some ingredients could not be counted.
    app_nutrition_per_serving:
      n.coverage > 0
        ? {
            kcal: round(n.perServing.kcal),
            protein_g: round(n.perServing.protein, 1),
            carbs_g: round(n.perServing.carbs, 1),
            fat_g: round(n.perServing.fat, 1),
            coverage: round(n.coverage, 2),
            not_counted: n.unknown.map((u) => u.label),
          }
        : null,
  };
}

export function searchRecipes(owner: Owner, query: string, limit = 10) {
  const results = filterRecipes(listRecipeSummaries(owner.householdId), { q: query })
    .slice(0, limit)
    .map((r) => ({ id: r.id, name: r.title, tags: r.tags }));
  return { results };
}

// ---------------------------------------------------------------------------
// Journal (snake_case for the tools)

export function logEntryView(e: LogEntry) {
  return {
    id: e.id,
    date: e.date,
    slot: e.slot,
    description: e.description,
    recipe_id: e.recipeId,
    servings: e.servings,
    est_kcal: e.estKcal,
    est_protein_g: e.estProteinG,
    est_carbs_g: e.estCarbsG,
    est_fat_g: e.estFatG,
    notes: e.notes,
  };
}

export function mealLogView(owner: Owner, dateFrom: string, dateTo?: string) {
  const { entries, totals } = listLog(owner, dateFrom, dateTo);
  return {
    date_from: dateFrom,
    date_to: dateTo ?? dateFrom,
    entries: entries.map(logEntryView),
    totals_by_date: totals.map((t) => ({
      date: t.date,
      est_kcal: t.estKcal,
      est_protein_g: t.estProteinG,
      est_carbs_g: t.estCarbsG,
      est_fat_g: t.estFatG,
      entries: t.entries,
      entries_without_estimate: t.entriesWithoutEstimate,
      entries_without_macros: t.entriesWithoutMacros,
    })),
  };
}

export function targetsView(t: Targets) {
  return {
    kcal_per_day: t.kcalPerDay,
    protein_g: t.proteinG,
    carbs_g: t.carbsG,
    fat_g: t.fatG,
    notes: t.notes,
    is_default: t.isDefault,
  };
}
