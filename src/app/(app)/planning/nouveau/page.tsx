import { BackLink } from "@/components/BackLink";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { NewPlanForm } from "@/components/planning/NewPlanForm";
import { TemplateList } from "@/components/planning/TemplateList";
import { aiEnabledFor } from "@/lib/ai/enabled";
import { requireUser } from "@/lib/auth";
import { defaultStartDate } from "@/lib/planning/dates";
import { listTemplates } from "@/lib/planning/templates";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { tagCounts, totalMinutes } from "@/lib/recipes/search";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  const { householdId } = await requireUser();
  const settings = getSettings(householdId);
  const summaries = listRecipeSummaries(householdId);
  const recipes = summaries
    .filter((r) => r.mealType === "plat" || r.mealType === "autre")
    .map((r) => ({ id: r.id, title: r.title, totalMinutes: totalMinutes(r) }));
  return (
    <>
      <BackLink href="/planning/historique">Plannings</BackLink>
      <PageHeader title="Nouveau planning" />
      {recipes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-500">
          Ajoute d&apos;abord des plats dans ta <Link href="/recettes" className="text-brand-700 underline">bibliothèque</Link>.
        </p>
      ) : (
        <NewPlanForm
          defaults={{ startDate: defaultStartDate(), days: settings.defaultDays, slots: settings.activeSlots }}
          recipes={recipes}
          tags={tagCounts(summaries).map((t) => t.tag)}
          aiAvailable={aiEnabledFor(householdId)}
        />
      )}
      <div className="mt-6">
        <TemplateList templates={listTemplates(householdId)} defaultStart={defaultStartDate()} />
      </div>
    </>
  );
}
