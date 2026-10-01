import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fold, guessAisle, parseIngredientLine } from "@/lib/recipes/normalize";
import { getSettings, saveSettings } from "@/lib/settings";
import { type NeedLine, type ShoppingItem, aggregate, formatItemAmounts } from "./aggregate";

function ownedPlan(householdId: number, planId: number) {
  return getDb()
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.id, planId), eq(schema.mealPlans.householdId, householdId)))
    .get();
}

/** Every ingredient of every cooked meal of the plan, scaled to its servings (leftovers ignored). */
export function needLines(planId: number): NeedLine[] {
  const db = getDb();
  const entries = db
    .select()
    .from(schema.mealPlanEntries)
    .where(eq(schema.mealPlanEntries.planId, planId))
    .all()
    .filter((e) => e.recipeId !== null && !e.isLeftover && !e.isEatingOut);
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

export function getShoppingList(householdId: number, planId: number) {
  const plan = ownedPlan(householdId, planId);
  if (!plan) return null;
  const rows = getDb().select().from(schema.shoppingListItems).where(eq(schema.shoppingListItems.planId, planId)).all();
  const state = new Map(rows.filter((r) => !r.manual && r.ingredientId).map((r) => [r.ingredientId!, r]));
  const pantry = new Set(getSettings(householdId).pantry.map(fold));

  const items: ListItem[] = aggregate(needLines(planId)).map((i) => ({
    ...i,
    amount: formatItemAmounts(i),
    checked: state.get(i.ingredientId)?.checked ?? false,
    removed: state.get(i.ingredientId)?.removed ?? false,
    pantry: pantry.has(fold(i.name)),
  }));
  const manual: ManualItem[] = rows
    .filter((r) => r.manual)
    .map((r) => ({ id: r.id, label: r.freeLabel ?? "", aisle: r.aisle ?? "autre", checked: r.checked }));
  return { plan, items, manual };
}

export type ShoppingList = NonNullable<ReturnType<typeof getShoppingList>>;

/** Checked / removed state of a generated line, kept even if the plan changes. */
export function setItemState(
  householdId: number,
  planId: number,
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
        eq(schema.shoppingListItems.planId, planId),
        eq(schema.shoppingListItems.ingredientId, ingredientId),
        eq(schema.shoppingListItems.manual, false),
      ),
    )
    .get();
  if (existing) {
    db.update(schema.shoppingListItems).set(patch).where(eq(schema.shoppingListItems.id, existing.id)).run();
  } else {
    db.insert(schema.shoppingListItems).values({ planId, ingredientId, manual: false, ...patch }).run();
  }
  return true;
}

export function addManualItem(householdId: number, planId: number, text: string): boolean {
  const label = text.trim().slice(0, 120);
  if (!label || !ownedPlan(householdId, planId)) return false;
  getDb()
    .insert(schema.shoppingListItems)
    .values({ planId, manual: true, freeLabel: label, aisle: guessAisle(parseIngredientLine(label).name) })
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
export function uncheckAll(householdId: number, planId: number): boolean {
  if (!ownedPlan(householdId, planId)) return false;
  getDb().update(schema.shoppingListItems).set({ checked: false }).where(eq(schema.shoppingListItems.planId, planId)).run();
  return true;
}

/** "Toujours au placard": hidden from every list of the household. */
export function setPantry(householdId: number, name: string, inPantry: boolean) {
  const current = getSettings(householdId).pantry;
  const key = fold(name);
  const next = inPantry ? [...current.filter((p) => fold(p) !== key), name] : current.filter((p) => fold(p) !== key);
  saveSettings(householdId, { pantry: next });
}
