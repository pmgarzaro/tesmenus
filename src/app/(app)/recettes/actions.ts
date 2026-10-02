"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aiEnabledFor } from "@/lib/ai/enabled";
import { AiError } from "@/lib/ai/gemini";
import { requireUser } from "@/lib/auth";
import { type NutritionInput, estimateMissingWithAi, recipeNutrition, saveIngredientNutrition } from "@/lib/nutrition/repo";
import { recipeInputSchema } from "@/lib/recipes/input";
import { createRecipe, deleteRecipe, getRecipe, updateRecipe } from "@/lib/recipes/repo";
import { resolveUpload } from "@/lib/uploads";

/** Creates (id null) or updates a recipe, then opens it. Returns an error message otherwise. */
export async function saveRecipe(
  id: number | null,
  payload: unknown,
  sourceType: "manuel" | "url" | "photo" = "manuel",
  imagePaths: string[] = [],
): Promise<string> {
  const { householdId } = await requireUser();
  // Only photos uploaded by this household (from the photo import).
  const photos = imagePaths.filter((p) => typeof p === "string" && resolveUpload(householdId, p));
  const parsed = recipeInputSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where =
      issue.path[0] === "ingredients"
        ? ` (ingrédient ${Number(issue.path[1]) + 1})`
        : issue.path[0] === "steps"
          ? ` (étape ${Number(issue.path[1]) + 1})`
          : "";
    return issue.message + where;
  }
  let recipeId = id;
  if (recipeId === null) {
    recipeId = createRecipe(householdId, parsed.data, sourceType, photos);
  } else if (!updateRecipe(householdId, recipeId, parsed.data)) {
    return "Recette introuvable";
  }
  revalidatePath("/recettes");
  redirect(`/recettes/${recipeId}`);
}

export async function removeRecipe(id: number): Promise<void> {
  const { householdId } = await requireUser();
  deleteRecipe(householdId, id);
  revalidatePath("/recettes");
  redirect("/recettes");
}

const per100Field = z.coerce.number().finite().min(0).max(900);

/**
 * Values typed by hand for one ingredient, saved for the whole household.
 * Empty macro fields mean "only the piece weight".
 */
export async function saveIngredientNutritionAction(
  recipeId: number,
  ingredientId: number,
  _prev: string | null,
  form: FormData,
): Promise<string | null> {
  const { householdId } = await requireUser();
  const raw = (k: string) => String(form.get(k) ?? "").replace(",", ".").trim();
  const input: NutritionInput = {};
  if (["kcal", "protein", "carbs", "fat"].some((k) => raw(k) !== "")) {
    const parsed = z
      .object({ kcal: per100Field, protein: per100Field.max(100), carbs: per100Field.max(100), fat: per100Field.max(100) })
      .safeParse({ kcal: raw("kcal") || 0, protein: raw("protein") || 0, carbs: raw("carbs") || 0, fat: raw("fat") || 0 });
    if (!parsed.success) return "Valeurs invalides (pour 100 g)";
    input.per100 = parsed.data;
  }
  if (raw("gramsPerUnit") !== "") {
    const g = Number(raw("gramsPerUnit"));
    if (!Number.isFinite(g) || g <= 0 || g > 5000) return "Poids invalide";
    input.gramsPerUnit = g;
  }
  if (input.per100 === undefined && input.gramsPerUnit === undefined) return "Rien à enregistrer";
  if (!saveIngredientNutrition(householdId, ingredientId, input, "manuel")) return "Ingrédient introuvable";
  revalidatePath(`/recettes/${recipeId}`);
  revalidatePath("/recettes");
  return null;
}

/** Fills the unknown ingredients of a recipe with the AI. */
export async function estimateNutritionAction(recipeId: number): Promise<string> {
  const { householdId } = await requireUser();
  if (!aiEnabledFor(householdId)) return "IA désactivée";
  const recipe = getRecipe(householdId, recipeId);
  if (!recipe) return "Recette introuvable";
  try {
    const filled = await estimateMissingWithAi(householdId, recipeNutrition(recipe).unknown);
    revalidatePath(`/recettes/${recipeId}`);
    revalidatePath("/recettes");
    return filled ? `${filled} ingrédient${filled > 1 ? "s" : ""} complété${filled > 1 ? "s" : ""} par l'IA` : "L'IA n'a rien pu estimer";
  } catch (e) {
    return e instanceof AiError ? e.message : "L'IA n'a pas répondu";
  }
}
