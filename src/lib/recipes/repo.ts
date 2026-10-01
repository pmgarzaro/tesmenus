import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { IngredientInput, RecipeInput } from "./input";
import { guessAisle, ingredientKey, normalizeIngredientName, normalizeTags } from "./normalize";
import { deleteUploads } from "@/lib/uploads";
import type { RecipeSummary } from "./search";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Finds the household's ingredient matching `label` (by canonical key) or creates it. */
function upsertIngredient(tx: Tx, householdId: number, ing: IngredientInput): number {
  const key = ingredientKey(ing.label);
  const existing = tx
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId))
    .all()
    .find((i) => ingredientKey(i.name) === key);
  if (existing) {
    if (ing.aisle && ing.aisle !== existing.aisle) {
      tx.update(schema.ingredients)
        .set({ aisle: ing.aisle })
        .where(eq(schema.ingredients.id, existing.id))
        .run();
    }
    return existing.id;
  }
  const name = normalizeIngredientName(ing.label);
  return tx
    .insert(schema.ingredients)
    .values({ householdId, name, aisle: ing.aisle ?? guessAisle(name) })
    .returning({ id: schema.ingredients.id })
    .get().id;
}

function writeChildren(tx: Tx, householdId: number, recipeId: number, input: RecipeInput) {
  tx.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipeId)).run();
  tx.delete(schema.recipeSteps).where(eq(schema.recipeSteps.recipeId, recipeId)).run();
  input.ingredients.forEach((ing, position) => {
    tx.insert(schema.recipeIngredients)
      .values({
        recipeId,
        ingredientId: upsertIngredient(tx, householdId, ing),
        position,
        quantity: ing.quantity,
        unit: ing.quantity === null ? null : ing.unit,
        originalLabel: ing.label,
        optional: ing.optional,
      })
      .run();
  });
  input.steps.forEach((step, position) => {
    tx.insert(schema.recipeSteps)
      .values({
        recipeId,
        position,
        text: step.text,
        durationMinutes: step.durationMinutes,
        type: step.type,
        equipment: step.equipment || null,
        temperature: step.temperature,
      })
      .run();
  });
}

const recipeColumns = (input: RecipeInput) => ({
  title: input.title,
  description: input.description || null,
  servings: input.servings,
  prepMinutes: input.prepMinutes,
  cookMinutes: input.cookMinutes,
  mealType: input.mealType,
  tags: normalizeTags(input.tags),
  sourceUrl: input.sourceUrl,
  notes: input.notes || null,
  fridgeDays: input.fridgeDays,
  freezable: input.freezable,
});

export function createRecipe(
  householdId: number,
  input: RecipeInput,
  sourceType: "manuel" | "url" | "photo" = "manuel",
  imagePaths: string[] = [],
): number {
  return getDb().transaction((tx) => {
    const { id } = tx
      .insert(schema.recipes)
      .values({ householdId, sourceType, imagePaths, ...recipeColumns(input) })
      .returning({ id: schema.recipes.id })
      .get();
    writeChildren(tx, householdId, id, input);
    return id;
  });
}

/** Returns false if the recipe does not exist in this household. */
export function updateRecipe(householdId: number, id: number, input: RecipeInput): boolean {
  return getDb().transaction((tx) => {
    const res = tx
      .update(schema.recipes)
      .set({ ...recipeColumns(input), updatedAt: sql`(datetime('now'))` })
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId)))
      .run();
    if (res.changes === 0) return false;
    writeChildren(tx, householdId, id, input);
    return true;
  });
}

export function deleteRecipe(householdId: number, id: number): boolean {
  const deleted = getDb()
    .delete(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId)))
    .returning({ imagePaths: schema.recipes.imagePaths })
    .get();
  if (!deleted) return false;
  deleteUploads(householdId, deleted.imagePaths);
  return true;
}

export function getRecipe(householdId: number, id: number) {
  const db = getDb();
  const recipe = db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId)))
    .get();
  if (!recipe) return null;
  const ingredients = db
    .select({
      ingredientId: schema.recipeIngredients.ingredientId,
      quantity: schema.recipeIngredients.quantity,
      unit: schema.recipeIngredients.unit,
      label: schema.recipeIngredients.originalLabel,
      optional: schema.recipeIngredients.optional,
      name: schema.ingredients.name,
      aisle: schema.ingredients.aisle,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .where(eq(schema.recipeIngredients.recipeId, id))
    .orderBy(asc(schema.recipeIngredients.position))
    .all()
    .map((i) => ({ ...i, label: i.label || i.name }));
  const steps = db
    .select()
    .from(schema.recipeSteps)
    .where(eq(schema.recipeSteps.recipeId, id))
    .orderBy(asc(schema.recipeSteps.position))
    .all();
  return { ...recipe, ingredients, steps };
}

export type FullRecipe = NonNullable<ReturnType<typeof getRecipe>>;

/** Converts a stored recipe back into form input (for editing). */
export function toInput(r: FullRecipe): RecipeInput {
  return {
    title: r.title,
    description: r.description,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    mealType: r.mealType,
    tags: r.tags,
    sourceUrl: r.sourceUrl,
    notes: r.notes,
    fridgeDays: r.fridgeDays,
    freezable: r.freezable,
    ingredients: r.ingredients.map((i) => ({
      quantity: i.quantity,
      unit: i.unit,
      label: i.label,
      aisle: i.aisle,
      optional: i.optional,
    })),
    steps: r.steps.map((s) => ({
      text: s.text,
      durationMinutes: s.durationMinutes,
      type: s.type,
      equipment: s.equipment,
      temperature: s.temperature,
    })),
  };
}

export function listRecipeSummaries(householdId: number): RecipeSummary[] {
  const db = getDb();
  const recipes = db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      mealType: schema.recipes.mealType,
      tags: schema.recipes.tags,
      prepMinutes: schema.recipes.prepMinutes,
      cookMinutes: schema.recipes.cookMinutes,
      freezable: schema.recipes.freezable,
      servings: schema.recipes.servings,
    })
    .from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId))
    .all();
  const names = db
    .select({ recipeId: schema.recipeIngredients.recipeId, name: schema.ingredients.name })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .where(eq(schema.ingredients.householdId, householdId))
    .all();
  const byRecipe = new Map<number, string[]>();
  for (const n of names) byRecipe.set(n.recipeId, [...(byRecipe.get(n.recipeId) ?? []), n.name]);
  return recipes
    .map((r) => ({ ...r, ingredientNames: byRecipe.get(r.id) ?? [] }))
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

/** Recipes with their ingredients (and optional flag) for the "vide-frigo". */
export function listFridgeRecipes(householdId: number) {
  const db = getDb();
  const rows = db
    .select({
      recipeId: schema.recipeIngredients.recipeId,
      name: schema.ingredients.name,
      optional: schema.recipeIngredients.optional,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .where(eq(schema.ingredients.householdId, householdId))
    .all();
  return listRecipeSummaries(householdId).map((r) => ({
    id: r.id,
    title: r.title,
    minutes: (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0),
    ingredients: rows.filter((x) => x.recipeId === r.id).map((x) => ({ name: x.name, optional: x.optional })),
  }));
}
