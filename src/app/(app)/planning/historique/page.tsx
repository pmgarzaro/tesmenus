import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { TemplateList } from "@/components/planning/TemplateList";
import { addDays, defaultStartDate, longDate, today } from "@/lib/planning/dates";
import { listPlans } from "@/lib/planning/repo";
import { listTemplates } from "@/lib/planning/templates";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { householdId } = await requireUser();
  const plans = listPlans(householdId);
  const templates = listTemplates(householdId);
  const t = today();
  return (
    <>
      <PageHeader
        title="Plannings"
        action={<Link href="/planning/nouveau" className="btn-primary px-4 py-2 text-sm font-semibold text-white">Nouveau</Link>}
      />
      {templates.length > 0 && (
        <div className="mb-5">
          <TemplateList templates={templates} defaultStart={defaultStartDate()} />
          <h2 className="mt-5 font-hand text-2xl font-bold">Mes plannings</h2>
        </div>
      )}
      {plans.length === 0 ? (
        <p className="p-6 text-center text-stone-500">Aucun planning.</p>
      ) : (
        <ul className="space-y-2">
          {plans.map((p) => {
            const end = addDays(p.startDate, p.days - 1);
            const state = end < t ? "passé" : p.startDate > t ? "à venir" : "en cours";
            return (
              <li key={p.id}>
                <Link href={`/planning/${p.id}`} className="flex items-center justify-between paper px-4 py-3">
                  <span>
                    Du {longDate(p.startDate)} au {longDate(end)}
                    <span className="block text-xs text-stone-500">{p.days} jour{p.days > 1 ? "s" : ""}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${state === "en cours" ? "bg-brand-100 text-brand-700" : "bg-stone-100 text-stone-600"}`}>
                    {state}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
