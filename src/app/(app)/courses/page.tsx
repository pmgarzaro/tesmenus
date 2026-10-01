import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { currentPlanId } from "@/lib/planning/repo";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const { householdId } = await requireUser();
  const id = currentPlanId(householdId);
  if (id) redirect(`/courses/${id}`);
  return (
    <>
      <PageHeader title="Liste de courses" />
      <div className="space-y-4 rounded-2xl border border-dashed border-stone-300 p-6 text-center">
        <p className="text-stone-600">La liste de courses se fait à partir d&apos;un planning.</p>
        <Link href="/planning/nouveau" className="inline-block btn-primary px-5 py-3 font-semibold text-white">
          Créer un planning
        </Link>
      </div>
    </>
  );
}
