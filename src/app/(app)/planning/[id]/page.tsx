import { CookingPot, ShoppingCart } from "lucide-react";
import { BackLink } from "@/components/BackLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MagnetTitle } from "@/components/MagnetTitle";
import { Warnings } from "@/components/Warnings";
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
  const empty = entries.filter((e) => !e.recipe && !e.isEatingOut).length;

  return (
    <>
      <div className="mb-1 flex items-center justify-between text-sm">
        <BackLink href="/planning/historique">Plannings</BackLink>
        <Link href="/planning/nouveau" className="text-brand-700">+ Nouveau planning</Link>
      </div>
      <header className="mb-4 space-y-2">
        <MagnetTitle text="Planning" />
        <p className="font-display text-xl font-semibold leading-tight">
          Du {longDate(plan.startDate)} au {longDate(addDays(plan.startDate, plan.days - 1))}
        </p>
        <p className="text-sm text-stone-500">
          {cooked} repas à cuisiner · {entries.filter((e) => e.isLeftover).length} repas de restes
          {empty > 0 && ` · ${empty} à choisir`}
        </p>
        <PlanActions planId={plan.id} emptyCount={empty} templateName={`Semaine du ${longDate(plan.startDate)}`} />
      </header>
      {warnings.length > 0 && (
        <div className="mb-3 space-y-1 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
          <Warnings items={warnings} />
        </div>
      )}
      {empty === entries.length && (
        <p className="mb-3 rounded-2xl bg-brand-50 p-3 text-sm text-brand-800">
          Touche un repas pour choisir sa recette, ou ajoute des recettes depuis leur fiche (« Ajouter au planning »).
        </p>
      )}
      <PlanGrid planId={plan.id} entries={entries} recipes={recipes} today={today()} />
      <Link
        href={`/courses/${plan.id}`}
        className="mt-4 block btn-primary p-3 text-center font-semibold text-white"
      >
        <ShoppingCart className="mr-2 inline size-5 align-[-3px]" aria-hidden />
        Liste de courses de ce planning
      </Link>
      <Link href={`/batch/nouveau?plan=${plan.id}`} className="mt-2 block rounded-2xl border border-brand-600 p-3 text-center font-semibold text-brand-700">
        <CookingPot className="mr-2 inline size-5 align-[-3px]" aria-hidden />
        Préparer en batch cooking
      </Link>
    </>
  );
}
