import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { RecipeForm } from "@/components/recipes/RecipeForm";
import { requireUser } from "@/lib/auth";
import { getRecipe, listRecipeSummaries, toInput } from "@/lib/recipes/repo";
import { tagCounts } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { householdId } = await requireUser();
  const recipe = getRecipe(householdId, Number((await params).id));
  if (!recipe) notFound();
  const allTags = tagCounts(listRecipeSummaries(householdId)).map((t) => t.tag);
  return (
    <>
      <PageHeader title="Modifier la recette" />
      <RecipeForm recipeId={recipe.id} initial={toInput(recipe)} allTags={allTags} />
    </>
  );
}
