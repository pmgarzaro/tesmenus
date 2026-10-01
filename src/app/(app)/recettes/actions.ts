"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { recipeInputSchema } from "@/lib/recipes/input";
import { createRecipe, deleteRecipe, updateRecipe } from "@/lib/recipes/repo";

/** Creates (id null) or updates a recipe, then opens it. Returns an error message otherwise. */
export async function saveRecipe(
  id: number | null,
  payload: unknown,
  sourceType: "manuel" | "url" | "photo" = "manuel",
): Promise<string> {
  const { householdId } = await requireUser();
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
    recipeId = createRecipe(householdId, parsed.data, sourceType);
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
