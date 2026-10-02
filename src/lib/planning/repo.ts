import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { totalMinutes } from "@/lib/recipes/search";
import { getSettings } from "@/lib/settings";
import { addDays, dateRange, today } from "./dates";
import {
  type PlanConstraints,
  type PlanOptions,
  type PlannerRecipe,
  type Slot,
  cellKey,
  generatePlan,
} from "./generate";

type StoredOptions = Pick<PlanOptions, "slots" | "people" | "servingsPerRecipe" | "dinnerCoversNextLunch"> & {
  constraints: PlanConstraints;
};

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

function plannerRecipes(householdId: number): PlannerRecipe[] {
  return listRecipeSummaries(householdId).map((r) => ({ ...r, totalMinutes: totalMinutes(r) }));
}

/** Recipes cooked in the 7 days before `startDate`. */
function recentRecipeIds(householdId: number, startDate: string, excludePlanId?: number): number[] {
  const rows = getDb()
    .select({ recipeId: schema.mealPlanEntries.recipeId, planId: schema.mealPlanEntries.planId })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.mealPlans, eq(schema.mealPlans.id, schema.mealPlanEntries.planId))
    .where(
      and(
        eq(schema.mealPlans.householdId, householdId),
        gte(schema.mealPlanEntries.date, addDays(startDate, -7)),
        lt(schema.mealPlanEntries.date, startDate),
      ),
    )
    .all();
  return rows.filter((r) => r.recipeId !== null && r.planId !== excludePlanId).map((r) => r.recipeId!);
}

function getOwnedPlan(householdId: number, planId: number) {
  return getDb()
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.id, planId), eq(schema.mealPlans.householdId, householdId)))
    .get();
}

type Plan = NonNullable<ReturnType<typeof getOwnedPlan>>;

function optionsOf(plan: Plan): PlanOptions {
  const o = plan.options as Partial<StoredOptions>;
  return {
    startDate: plan.startDate,
    days: plan.days,
    slots: o.slots ?? ["midi", "soir"],
    people: o.people ?? 2,
    servingsPerRecipe: o.servingsPerRecipe ?? 4,
    dinnerCoversNextLunch: o.dinnerCoversNextLunch ?? true,
    constraints: o.constraints ?? {},
  };
}

/** Replaces all entries of a plan with a freshly generated week. */
function fillPlan(householdId: number, plan: Plan, seed: number): string[] {
  const options = { ...optionsOf(plan), recentRecipeIds: recentRecipeIds(householdId, plan.startDate, plan.id), seed };
  const { entries, warnings } = generatePlan(options, plannerRecipes(householdId));
  getDb().transaction((tx) => {
    tx.delete(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.planId, plan.id)).run();
    const ids = new Map<string, number>();
    // Cooking entries first so leftovers can point to them.
    for (const e of [...entries.filter((x) => !x.isLeftover), ...entries.filter((x) => x.isLeftover)]) {
      const { id } = tx
        .insert(schema.mealPlanEntries)
        .values({
          planId: plan.id,
          date: e.date,
          slot: e.slot,
          recipeId: e.recipeId,
          servings: e.servings,
          isLeftover: e.isLeftover,
          sourceEntryId: e.sourceKey ? ids.get(e.sourceKey) ?? null : null,
        })
        .returning({ id: schema.mealPlanEntries.id })
        .get();
      ids.set(cellKey(e.date, e.slot), id);
    }
  });
  return warnings;
}

export type NewPlanInput = {
  startDate: string;
  days: number;
  slots: Slot[];
  constraints: PlanConstraints;
  /** "manual": every meal starts empty, filled by hand. */
  mode?: "auto" | "manual";
};

export function createPlan(householdId: number, input: NewPlanInput): { id: number; warnings: string[] } {
  const s = getSettings(householdId);
  const options: StoredOptions = {
    slots: input.slots,
    people: s.people,
    servingsPerRecipe: s.servingsPerRecipe,
    dinnerCoversNextLunch: s.dinnerCoversNextLunch,
    constraints: input.constraints,
  };
  const plan = getDb()
    .insert(schema.mealPlans)
    .values({ householdId, startDate: input.startDate, days: input.days, options })
    .returning()
    .get();
  if (input.mode === "manual") {
    getDb()
      .insert(schema.mealPlanEntries)
      .values(
        dateRange(input.startDate, input.days).flatMap((date) =>
          (["midi", "soir"] as const).filter((slot) => input.slots.includes(slot)).map((slot) => ({ planId: plan.id, date, slot })),
        ),
      )
      .run();
    return { id: plan.id, warnings: [] };
  }
  return { id: plan.id, warnings: fillPlan(householdId, plan, randomSeed()) };
}

export function regeneratePlan(householdId: number, planId: number): string[] | null {
  const plan = getOwnedPlan(householdId, planId);
  return plan ? fillPlan(householdId, plan, randomSeed()) : null;
}

export function deletePlan(householdId: number, planId: number): boolean {
  const res = getDb()
    .delete(schema.mealPlans)
    .where(and(eq(schema.mealPlans.id, planId), eq(schema.mealPlans.householdId, householdId)))
    .run();
  return res.changes > 0;
}

export function getPlan(householdId: number, planId: number) {
  const plan = getOwnedPlan(householdId, planId);
  if (!plan) return null;
  const db = getDb();
  const entries = db
    .select()
    .from(schema.mealPlanEntries)
    .where(eq(schema.mealPlanEntries.planId, planId))
    .orderBy(asc(schema.mealPlanEntries.date), asc(schema.mealPlanEntries.slot)) // midi before soir
    .all();
  const recipeIds = [...new Set(entries.map((e) => e.recipeId).filter((x): x is number => x !== null))];
  const recipes = recipeIds.length
    ? db
        .select({
          id: schema.recipes.id,
          title: schema.recipes.title,
          tags: schema.recipes.tags,
          prepMinutes: schema.recipes.prepMinutes,
          cookMinutes: schema.recipes.cookMinutes,
          freezable: schema.recipes.freezable,
        })
        .from(schema.recipes)
        .where(inArray(schema.recipes.id, recipeIds))
        .all()
    : [];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const byEntry = new Map(entries.map((e) => [e.id, e]));
  return {
    ...plan,
    options: optionsOf(plan),
    entries: entries.map((e) => {
      const source = e.sourceEntryId ? byEntry.get(e.sourceEntryId) : undefined;
      const recipeId = e.isLeftover ? source?.recipeId ?? null : e.recipeId;
      return {
        ...e,
        recipe: recipeId ? byId.get(recipeId) ?? null : null,
        source: source ? { id: source.id, date: source.date, slot: source.slot } : null,
        hasLeftovers: entries.some((x) => x.sourceEntryId === e.id),
      };
    }),
  };
}

export type FullPlan = NonNullable<ReturnType<typeof getPlan>>;
export type PlanEntryView = FullPlan["entries"][number];

export function listPlans(householdId: number) {
  return getDb()
    .select()
    .from(schema.mealPlans)
    .where(eq(schema.mealPlans.householdId, householdId))
    .orderBy(desc(schema.mealPlans.startDate), desc(schema.mealPlans.id))
    .all();
}

/** The plan covering today, else the next one, else the most recent. */
export function currentPlanId(householdId: number): number | null {
  const plans = listPlans(householdId);
  const t = today();
  const covering = plans.find((p) => p.startDate <= t && t <= addDays(p.startDate, p.days - 1));
  const upcoming = [...plans].reverse().find((p) => p.startDate > t);
  return (covering ?? upcoming ?? plans[0])?.id ?? null;
}

// ---------------------------------------------------------------------------
// Editing a cell. Every function checks the entry belongs to the household.

function ownedEntry(householdId: number, entryId: number) {
  const row = getDb()
    .select({ entry: schema.mealPlanEntries, plan: schema.mealPlans })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.mealPlans, eq(schema.mealPlans.id, schema.mealPlanEntries.planId))
    .where(and(eq(schema.mealPlanEntries.id, entryId), eq(schema.mealPlans.householdId, householdId)))
    .get();
  return row ?? null;
}

function update(entryId: number, values: Partial<typeof schema.mealPlanEntries.$inferInsert>) {
  getDb().update(schema.mealPlanEntries).set(values).where(eq(schema.mealPlanEntries.id, entryId)).run();
}

/** Leftover meals depending on this entry become empty again. */
function releaseDependents(entryId: number) {
  getDb()
    .update(schema.mealPlanEntries)
    .set({ isLeftover: false, sourceEntryId: null, recipeId: null, servings: null })
    .where(eq(schema.mealPlanEntries.sourceEntryId, entryId))
    .run();
}

function cookingServings(plan: Plan, entryId: number): number {
  const o = optionsOf(plan);
  const feedsLeftovers = getDb()
    .select()
    .from(schema.mealPlanEntries)
    .where(eq(schema.mealPlanEntries.sourceEntryId, entryId))
    .get();
  return feedsLeftovers ? o.servingsPerRecipe : o.people;
}

export function setEntryRecipe(householdId: number, entryId: number, recipeId: number | null): boolean {
  const owned = ownedEntry(householdId, entryId);
  if (!owned) return false;
  if (recipeId !== null) {
    const recipe = getDb()
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, householdId)))
      .get();
    if (!recipe) return false;
  } else {
    releaseDependents(entryId);
  }
  update(entryId, {
    recipeId,
    isLeftover: false,
    isEatingOut: false,
    sourceEntryId: null,
    servings: recipeId === null ? null : owned.entry.recipeId ? owned.entry.servings : cookingServings(owned.plan, entryId),
  });
  if (recipeId !== null) linkNextLunch(owned.plan, { ...owned.entry, id: entryId });
  return true;
}

/**
 * With the leftovers rule, a dinner also feeds the next day's lunch when that
 * lunch is still empty (useful when filling a plan by hand).
 */
function linkNextLunch(plan: Plan, dinner: { id: number; date: string; slot: string }) {
  const o = optionsOf(plan);
  if (dinner.slot !== "soir" || !o.dinnerCoversNextLunch) return;
  const lunch = getDb()
    .select()
    .from(schema.mealPlanEntries)
    .where(
      and(
        eq(schema.mealPlanEntries.planId, plan.id),
        eq(schema.mealPlanEntries.date, addDays(dinner.date, 1)),
        eq(schema.mealPlanEntries.slot, "midi"),
      ),
    )
    .get();
  if (!lunch || lunch.recipeId || lunch.isLeftover || lunch.isEatingOut) return;
  update(lunch.id, { isLeftover: true, sourceEntryId: dinner.id, recipeId: null, servings: null });
  const current = getDb().select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, dinner.id)).get();
  if (current && (current.servings ?? 0) < o.servingsPerRecipe) update(dinner.id, { servings: o.servingsPerRecipe });
}

/**
 * Fills only the empty meals at random (dinners first, so their leftovers can
 * cover the next lunches), keeping everything chosen by hand.
 */
export function fillEmptyEntries(householdId: number, planId: number, onlyIds?: number[]): string[] | null {
  const warnings: string[] = [];
  for (const slot of ["soir", "midi"] as const) {
    const plan = getPlan(householdId, planId);
    if (!plan) return null;
    const isEmpty = (e: PlanEntryView) => !e.recipeId && !e.isLeftover && !e.isEatingOut;
    const targets = plan.entries.filter(
      (e) => isEmpty(e) && e.slot === slot && (!onlyIds || onlyIds.includes(e.id)),
    );
    if (targets.length === 0) continue;
    const fixed: Record<string, number | null> = {};
    for (const e of plan.entries) {
      if (targets.includes(e)) continue;
      // Leftover meals count as their source recipe, so it is not picked again.
      fixed[cellKey(e.date, e.slot)] = e.isLeftover ? null : e.recipeId;
    }
    const generated = generatePlan(
      {
        ...plan.options,
        dinnerCoversNextLunch: false,
        fixed,
        recentRecipeIds: recentRecipeIds(householdId, plan.startDate, plan.id),
        seed: randomSeed(),
      },
      plannerRecipes(householdId),
    );
    warnings.push(...generated.warnings);
    for (const t of targets) {
      const picked = generated.entries.find((e) => e.date === t.date && e.slot === t.slot)?.recipeId;
      if (picked) setEntryRecipe(householdId, t.id, picked);
    }
  }
  return [...new Set(warnings)];
}

/**
 * Applies the household settings to plans not finished yet: the stored
 * options follow the new values, and when the leftovers rule is turned off,
 * upcoming leftover meals get their own recipe. Past meals are kept.
 * Returns how many plans had leftover meals replaced.
 */
export function syncOpenPlansWithSettings(householdId: number): number {
  const s = getSettings(householdId);
  const t = today();
  let changed = 0;
  const plans = listPlans(householdId).filter((p) => addDays(p.startDate, p.days - 1) >= t);
  for (const p of plans) {
    const plan = getOwnedPlan(householdId, p.id)!;
    const options: StoredOptions = {
      ...(plan.options as StoredOptions),
      people: s.people,
      servingsPerRecipe: s.servingsPerRecipe,
      dinnerCoversNextLunch: s.dinnerCoversNextLunch,
    };
    getDb().update(schema.mealPlans).set({ options }).where(eq(schema.mealPlans.id, plan.id)).run();
    if (s.dinnerCoversNextLunch) continue;
    const leftovers = getDb()
      .select()
      .from(schema.mealPlanEntries)
      .where(
        and(
          eq(schema.mealPlanEntries.planId, plan.id),
          eq(schema.mealPlanEntries.isLeftover, true),
          gte(schema.mealPlanEntries.date, t),
        ),
      )
      .all();
    if (leftovers.length === 0) continue;
    for (const l of leftovers) {
      update(l.id, { isLeftover: false, sourceEntryId: null, recipeId: null, servings: null });
      if (!l.sourceEntryId) continue;
      const stillFeeds = getDb()
        .select()
        .from(schema.mealPlanEntries)
        .where(eq(schema.mealPlanEntries.sourceEntryId, l.sourceEntryId))
        .get();
      if (!stillFeeds) update(l.sourceEntryId, { servings: s.people });
    }
    fillEmptyEntries(householdId, plan.id, leftovers.map((l) => l.id));
    changed++;
  }
  return changed;
}

export function setEatingOut(householdId: number, entryId: number): boolean {
  if (!ownedEntry(householdId, entryId)) return false;
  releaseDependents(entryId);
  update(entryId, { recipeId: null, isLeftover: false, isEatingOut: true, sourceEntryId: null, servings: null });
  return true;
}

/** Marks a meal as eating the leftovers of an earlier cooked meal of the same plan. */
export function setLeftover(householdId: number, entryId: number, sourceEntryId: number): boolean {
  const owned = ownedEntry(householdId, entryId);
  const source = ownedEntry(householdId, sourceEntryId);
  if (!owned || !source || source.plan.id !== owned.plan.id || !source.entry.recipeId) return false;
  const before = (e: { date: string; slot: string }) => `${e.date}|${e.slot === "midi" ? 0 : 1}`;
  if (before(source.entry) >= before(owned.entry)) return false;
  releaseDependents(entryId);
  update(entryId, { recipeId: null, isLeftover: true, isEatingOut: false, sourceEntryId, servings: null });
  // The cooked meal now has to feed one more meal.
  const o = optionsOf(owned.plan);
  if ((source.entry.servings ?? 0) < o.servingsPerRecipe) update(sourceEntryId, { servings: o.servingsPerRecipe });
  return true;
}

export function setServings(householdId: number, entryId: number, servings: number): boolean {
  const owned = ownedEntry(householdId, entryId);
  if (!owned || !owned.entry.recipeId || servings < 1 || servings > 50) return false;
  update(entryId, { servings });
  return true;
}

/** Picks another recipe for one cooked meal, keeping the rest of the week. */
export function rerollEntry(householdId: number, entryId: number): boolean {
  const owned = ownedEntry(householdId, entryId);
  if (!owned || owned.entry.isLeftover) return false;
  const plan = getPlan(householdId, owned.plan.id)!;
  const fixed: Record<string, number | null> = {};
  for (const e of plan.entries) {
    if (e.id !== entryId && !e.isLeftover) fixed[cellKey(e.date, e.slot)] = e.recipeId;
  }
  // Generate as if every meal were cooked, so any cell can be rerolled.
  const options: PlanOptions = {
    ...plan.options,
    dinnerCoversNextLunch: false,
    fixed,
    avoid: owned.entry.recipeId ? [owned.entry.recipeId] : [],
    recentRecipeIds: recentRecipeIds(householdId, plan.startDate, plan.id),
    seed: randomSeed(),
  };
  const { entries } = generatePlan(options, plannerRecipes(householdId));
  const picked = entries.find((e) => e.date === owned.entry.date && e.slot === owned.entry.slot)?.recipeId ?? null;
  if (picked === null) return false;
  return setEntryRecipe(householdId, entryId, picked);
}

/** Swaps two cooked / empty / eating-out meals (leftover meals stay put). */
export function swapEntries(householdId: number, aId: number, bId: number): boolean {
  const a = ownedEntry(householdId, aId);
  const b = ownedEntry(householdId, bId);
  if (!a || !b || a.plan.id !== b.plan.id || a.entry.isLeftover || b.entry.isLeftover) return false;
  const pick = (e: typeof a.entry) => ({ recipeId: e.recipeId, isEatingOut: e.isEatingOut, servings: e.servings });
  getDb().transaction(() => {
    update(aId, pick(b.entry));
    update(bId, pick(a.entry));
  });
  // A meal that no longer cooks cannot feed leftovers.
  for (const id of [aId, bId]) {
    const e = ownedEntry(householdId, id)!.entry;
    if (!e.recipeId) releaseDependents(id);
  }
  return true;
}


/** Plans not finished yet, with what each meal currently holds (for "add to plan"). */
export function openPlans(householdId: number) {
  const t = today();
  return listPlans(householdId)
    .filter((p) => addDays(p.startDate, p.days - 1) >= t)
    .reverse()
    .map((p) => {
      const full = getPlan(householdId, p.id)!;
      return {
        id: p.id,
        startDate: p.startDate,
        days: p.days,
        entries: full.entries.map((e) => ({
          id: e.id,
          date: e.date,
          slot: e.slot,
          content: e.isEatingOut
            ? "Repas extérieur"
            : e.isLeftover && e.recipe
              ? `Restes : ${e.recipe.title}`
              : (e.recipe?.title ?? null),
        })),
      };
    });
}
