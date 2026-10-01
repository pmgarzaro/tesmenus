import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { NewBatchForm } from "@/components/batch/NewBatchForm";
import { requireUser } from "@/lib/auth";
import { batchCandidates, defaultSessionDate } from "@/lib/batch/repo";
import { currentPlanId, openPlans } from "@/lib/planning/repo";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { totalMinutes } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

export default async function NewBatchPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { householdId } = await requireUser();
  const plans = openPlans(householdId).map((p) => ({ id: p.id, startDate: p.startDate }));
  const param = (await searchParams).plan;
  const planId = param === "none" ? null : Number(param) || currentPlanId(householdId);
  const candidates = (planId && batchCandidates(householdId, planId)) || [];
  const recipes = listRecipeSummaries(householdId).map((r) => ({ id: r.id, title: r.title, servings: r.servings, minutes: totalMinutes(r) }));
  return (
    <>
      <Link href="/batch" className="text-sm text-stone-500">← Batch cooking</Link>
      <PageHeader title="Nouvelle session" />
      <NewBatchForm
        key={planId ?? "none"}
        plans={plans}
        planId={candidates.length ? planId : null}
        candidates={candidates}
        recipes={recipes}
        defaultDate={defaultSessionDate(candidates.map((c) => c.date).sort()[0])}
      />
    </>
  );
}
