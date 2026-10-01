import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanActions } from "@/components/planning/PlanActions";
import { PlanGrid } from "@/components/planning/PlanGrid";
import { requireUser } from "@/lib/auth";
import { addDays, longDate, today } from "@/lib/planning/dates";
import { getPlan } from "@/lib/planning/repo";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { totalMinutes } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { householdId } = await requireUser();
  const plan = getPlan(householdId, Number((await params).id));
  if (!plan) notFound();
  let warnings: string[] = [];
  try {
    const w = (await searchParams).w;
    warnings = w ? JSON.parse(w) : [];
  } catch {}

  const recipes = listRecipeSummaries(householdId)
    .filter((r) => r.mealType === "plat" || r.mealType === "autre")
    .map((r) => ({ id: r.id, title: r.title, minutes: totalMinutes(r), tags: r.tags }));
  const entries = plan.entries.map((e) => ({
    id: e.id,
    date: e.date,
    slot: e.slot,
    recipeId: e.recipeId,
    servings: e.servings,
    isLeftover: e.isLeftover,
    isEatingOut: e.isEatingOut,
    hasLeftovers: e.hasLeftovers,
    source: e.source,
    recipe: e.recipe && { id: e.recipe.id, title: e.recipe.title, tags: e.recipe.tags, minutes: totalMinutes(e.recipe) },
  }));
  const cooked = entries.filter((e) => e.recipe && !e.isLeftover).length;

  return (
    <>
      <div className="mb-1 flex items-center justify-between text-sm">
        <Link href="/planning/historique" className="text-stone-500">← Plannings</Link>
        <Link href="/planning/nouveau" className="text-brand-700">+ Nouveau planning</Link>
      </div>
      <header className="mb-4 space-y-2">
        <h1 className="text-2xl font-bold">
          Du {longDate(plan.startDate)} au {longDate(addDays(plan.startDate, plan.days - 1))}
        </h1>
        <p className="text-sm text-stone-500">
          {cooked} repas à cuisiner · {entries.filter((e) => e.isLeftover).length} repas de restes
        </p>
        <PlanActions planId={plan.id} />
      </header>
      {warnings.length > 0 && (
        <div className="mb-3 space-y-1 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
          {warnings.map((w) => <p key={w}>⚠️ {w}</p>)}
        </div>
      )}
      <PlanGrid planId={plan.id} entries={entries} recipes={recipes} today={today()} />
      <p className="mt-4 rounded-2xl border border-dashed border-stone-300 p-3 text-center text-sm text-stone-500">
        🛒 Liste de courses de ce planning : étape 6
      </p>
    </>
  );
}
