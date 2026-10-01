import { PageHeader } from "@/components/PageHeader";
import { RecipeForm } from "@/components/recipes/RecipeForm";
import { requireUser } from "@/lib/auth";
import { EMPTY_RECIPE } from "@/lib/recipes/input";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { tagCounts } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  const { householdId } = await requireUser();
  const allTags = tagCounts(listRecipeSummaries(householdId)).map((t) => t.tag);
  return (
    <>
      <PageHeader title="Nouvelle recette" />
      <RecipeForm recipeId={null} initial={EMPTY_RECIPE} allTags={allTags} />
    </>
  );
}
