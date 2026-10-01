"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { recipeInputSchema } from "@/lib/recipes/input";
import { createRecipe, deleteRecipe, updateRecipe } from "@/lib/recipes/repo";
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
