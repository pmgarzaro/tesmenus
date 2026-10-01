import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { currentPlanId } from "@/lib/planning/repo";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const { householdId } = await requireUser();
  const id = currentPlanId(householdId);
  if (id) redirect(`/planning/${id}`);
  return (
    <>
      <PageHeader title="Planning" />
      <div className="space-y-4 rounded-2xl border border-dashed border-stone-300 p-6 text-center">
        <p className="text-stone-600">Aucun planning pour l&apos;instant.</p>
        <Link href="/planning/nouveau" className="inline-block btn-primary px-5 py-3 font-semibold text-white">
          Créer le planning de la semaine
        </Link>
      </div>
    </>
  );
}
