import { notFound } from "next/navigation";
import { CookMode } from "@/components/batch/CookMode";
import { requireUser } from "@/lib/auth";
import { recipeSheet } from "@/lib/batch/repo";

export const dynamic = "force-dynamic";

/** Cook one recipe straight from the library, step by step, without planning it. */
export default async function CookRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { householdId } = await requireUser();
  const id = Number((await params).id);
  const sheet = recipeSheet(householdId, id);
  if (!sheet || sheet.timeline.length === 0) notFound();
  return <CookMode storeKey={`cook-recipe-${id}`} exitHref={`/recettes/${id}`} sheet={sheet} />;
}
