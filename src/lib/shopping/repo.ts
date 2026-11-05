import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fold, guessAisle, parseIngredientLine } from "@/lib/recipes/normalize";
import { addDays, isValidDate } from "@/lib/planning/dates";
import { getSettings, saveSettings } from "@/lib/settings";
import { type NeedLine, type ShoppingItem, aggregate, formatItemAmounts } from "./aggregate";

// ---------------------------------------------------------------------------
// Periods: a list can cover only the meals cooked between two dates of the
// plan (one shopping trip). Each period keeps its own ticks and extra items.

export type Period = { from: string; to: string; key: string };

/**
 * The period of a plan to shop for, clamped to the plan's dates. Missing or
 * invalid dates mean the whole plan (key "").
 */
export function resolvePeriod(plan: { startDate: string; days: number }, from?: string | null, to?: string | null): Period {
  const start = plan.startDate;
  const end = addDays(start, plan.days - 1);
  const clamp = (d: string | null | undefined, fallback: string) =>
    d && isValidDate(d) ? (d < start ? start : d > end ? end : d) : fallback;
  let f = clamp(from, start);
  let t = clamp(to, end);
  if (t < f) [f, t] = [t, f];
  return { from: f, to: t, key: f === start && t === end ? "" : `${f}_${t}` };
}

/** Period from its stored key, for a given plan. */
export function periodFromKey(plan: { startDate: string; days: number }, key: string): Period {
  const [from, to] = key.split("_");
  return resolvePeriod(plan, from, to);
}

function ownedPlan(householdId: number, planId: number) {
  return getDb()
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.id, planId), eq(schema.mealPlans.householdId, householdId)))
    .get();
}

/**
 * Every ingredient of every meal cooked in the plan (optionally only between
 * `from` and `to`), scaled to its servings. Leftover meals are ignored: their
 * ingredients count on the day they are cooked.
 */
export function needLines(planId: number, from?: string, to?: string): NeedLine[] {
  const db = getDb();
  const entries = db
    .select()
    .from(schema.mealPlanEntries)
    .where(eq(schema.mealPlanEntries.planId, planId))
    .all()
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  return linesOf(entries);
}

/** Ingredient lines of planned meals (entries of any plan). */
export function linesOf(planEntries: (typeof schema.mealPlanEntries.$inferSelect)[]): NeedLine[] {
  const db = getDb();
  const entries = planEntries.filter((e) => e.recipeId !== null && !e.isLeftover && !e.isEatingOut);
  const recipeIds = [...new Set(entries.map((e) => e.recipeId!))];
  if (recipeIds.length === 0) return [];
  const recipes = new Map(
    db
      .select({ id: schema.recipes.id, title: schema.recipes.title, servings: schema.recipes.servings })
      .from(schema.recipes)
      .where(inArray(schema.recipes.id, recipeIds))
      .all()
      .map((r) => [r.id, r]),
  );
  const ingredients = db
    .select({
      recipeId: schema.recipeIngredients.recipeId,
      ingredientId: schema.ingredients.id,
      name: schema.ingredients.name,
      aisle: schema.ingredients.aisle,
      quantity: schema.recipeIngredients.quantity,
      unit: schema.recipeIngredients.unit,
      optional: schema.recipeIngredients.optional,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .where(inArray(schema.recipeIngredients.recipeId, recipeIds))
    .all();

  return entries.flatMap((e) => {
    const r = recipes.get(e.recipeId!)!;
    const factor = (e.servings ?? r.servings) / r.servings;
    return ingredients
      .filter((i) => i.recipeId === r.id)
      .map((i) => ({
        ingredientId: i.ingredientId,
        name: i.name,
        aisle: i.aisle,
        quantity: i.quantity === null ? null : i.quantity * factor,
        unit: i.unit,
        optional: i.optional,
        recipe: r.title,
      }));
  });
}

export type ListItem = ShoppingItem & { amount: string; checked: boolean; removed: boolean; pantry: boolean };
export type ManualItem = { id: number; label: string; aisle: ShoppingItem["aisle"]; checked: boolean };

const inList = (planId: number, period: string) =>
  and(eq(schema.shoppingListItems.planId, planId), eq(schema.shoppingListItems.period, period));

export function getShoppingList(householdId: number, planId: number, from?: string | null, to?: string | null) {
  const plan = ownedPlan(householdId, planId);
  if (!plan) return null;
  const period = resolvePeriod(plan, from, to);
  const rows = getDb().select().from(schema.shoppingListItems).where(inList(planId, period.key)).all();
  const state = new Map(rows.filter((r) => !r.manual && r.ingredientId).map((r) => [r.ingredientId!, r]));
  const pantry = new Set(getSettings(householdId).pantry.map(fold));

  const items: ListItem[] = aggregate(needLines(planId, period.from, period.to)).map((i) => ({
    ...i,
    amount: formatItemAmounts(i),
    checked: state.get(i.ingredientId)?.checked ?? false,
    removed: state.get(i.ingredientId)?.removed ?? false,
    pantry: pantry.has(fold(i.name)),
  }));
  const manual: ManualItem[] = rows
    .filter((r) => r.manual)
    .map((r) => ({ id: r.id, label: r.freeLabel ?? "", aisle: r.aisle ?? "autre", checked: r.checked }));
  return { plan, period, items, manual };
}

export type ShoppingList = NonNullable<ReturnType<typeof getShoppingList>>;

/** Checked / removed state of a generated line, kept even if the plan changes. */
export function setItemState(
  householdId: number,
  planId: number,
  period: string,
  ingredientId: number,
  patch: { checked?: boolean; removed?: boolean },
): boolean {
  if (!ownedPlan(householdId, planId)) return false;
  const db = getDb();
  const ingredient = db
    .select({ id: schema.ingredients.id })
    .from(schema.ingredients)
    .where(and(eq(schema.ingredients.id, ingredientId), eq(schema.ingredients.householdId, householdId)))
    .get();
  if (!ingredient) return false;
  const existing = db
    .select()
    .from(schema.shoppingListItems)
    .where(
      and(
        inList(planId, period),
        eq(schema.shoppingListItems.ingredientId, ingredientId),
        eq(schema.shoppingListItems.manual, false),
      ),
    )
    .get();
  if (existing) {
    db.update(schema.shoppingListItems).set(patch).where(eq(schema.shoppingListItems.id, existing.id)).run();
  } else {
    db.insert(schema.shoppingListItems).values({ planId, period, ingredientId, manual: false, ...patch }).run();
  }
  return true;
}

export function addManualItem(householdId: number, planId: number, period: string, text: string): boolean {
  const label = text.trim().slice(0, 120);
  if (!label || !ownedPlan(householdId, planId)) return false;
  getDb()
    .insert(schema.shoppingListItems)
    .values({ planId, period, manual: true, freeLabel: label, aisle: guessAisle(parseIngredientLine(label).name) })
    .run();
  return true;
}

function ownedManual(householdId: number, planId: number, id: number) {
  if (!ownedPlan(householdId, planId)) return null;
  return getDb()
    .select()
    .from(schema.shoppingListItems)
    .where(and(eq(schema.shoppingListItems.id, id), eq(schema.shoppingListItems.planId, planId), eq(schema.shoppingListItems.manual, true)))
    .get();
}

export function setManualChecked(householdId: number, planId: number, id: number, checked: boolean): boolean {
  if (!ownedManual(householdId, planId, id)) return false;
  getDb().update(schema.shoppingListItems).set({ checked }).where(eq(schema.shoppingListItems.id, id)).run();
  return true;
}

export function deleteManualItem(householdId: number, planId: number, id: number): boolean {
  if (!ownedManual(householdId, planId, id)) return false;
  getDb().delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, id)).run();
  return true;
}

/** New shopping trip: everything unchecked. */
export function uncheckAll(householdId: number, planId: number, period: string): boolean {
  if (!ownedPlan(householdId, planId)) return false;
  getDb().update(schema.shoppingListItems).set({ checked: false }).where(inList(planId, period)).run();
  return true;
}

/** "Toujours au placard": hidden from every list of the household. */
export function setPantry(householdId: number, name: string, inPantry: boolean) {
  const current = getSettings(householdId).pantry;
  const key = fold(name);
  const next = inPantry ? [...current.filter((p) => fold(p) !== key), name] : current.filter((p) => fold(p) !== key);
  saveSettings(householdId, { pantry: next });
}
