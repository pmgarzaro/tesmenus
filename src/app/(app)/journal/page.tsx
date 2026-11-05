import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { LOG_SLOT_LABELS, type LogSlot } from "@/lib/journal/input";
import { getTargets, listLog } from "@/lib/journal/repo";
import { plannedMeals, recipeView } from "@/lib/mcp/data";
import { APP_TIMEZONE, addDays, isValidDate, longDate, today, weekdayName } from "@/lib/planning/dates";
import { EditEntry, type PlanSuggestion, QuickAdd, TargetsForm } from "./JournalForms";
import { removeEntry } from "./actions";

export const dynamic = "force-dynamic";

/** Slot suggested for a new entry, from the current hour. */
function slotForNow(): LogSlot {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snack";
  return "dinner";
}

function Meter({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span>
          <strong className="text-base">{Math.round(value)}</strong> / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-door" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={target} aria-label={label}>
        <div className={`h-full rounded-full ${over ? "bg-magnet-red" : "bg-magnet-green"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const owner = { userId: user.id, householdId: user.householdId };
  const t = today();
  const requested = (await searchParams).date;
  const date = requested && isValidDate(requested) ? requested : t;

  const { entries, totals } = listLog(owner, date);
  const day = totals[0];
  const targets = getTargets(owner);

  const suggestions: PlanSuggestion[] = plannedMeals(owner, date)
    .meals.filter((m) => m.recipe_id !== null)
    .map((m) => {
      const n = recipeView(owner, m.recipe_id!, 1)?.app_nutrition_per_serving;
      const trusted = n && n.coverage >= 0.75;
      return {
        slot: m.slot,
        recipeId: m.recipe_id!,
        name: m.recipe_name!,
        kcal: trusted ? n.kcal : null,
        protein: trusted ? n.protein_g : null,
      };
    });

  const nav = "flex size-9 items-center justify-center rounded-full bg-white shadow-sm";
  return (
    <>
      <PageHeader title="Journal" />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/journal?date=${addDays(date, -1)}`} className={nav} aria-label="Jour précédent">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-center">
          <p className="font-semibold capitalize">
            {date === t ? "Aujourd'hui" : weekdayName(date)} · {longDate(date)}
          </p>
          {date !== t && (
            <Link href="/journal" className="text-xs text-stone-500 underline">
              Revenir à aujourd&apos;hui
            </Link>
          )}
        </div>
        <Link href={`/journal?date=${addDays(date, 1)}`} className={nav} aria-label="Jour suivant">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <section className="paper space-y-3 p-4">
        <Meter label="Calories" value={day?.estKcal ?? 0} target={targets.kcalPerDay} unit="kcal" />
        <Meter label="Protéines" value={day?.estProteinG ?? 0} target={targets.proteinG} unit="g" />
        {day && day.entriesWithoutEstimate > 0 && (
          <p className="text-xs text-stone-500">
            {day.entriesWithoutEstimate} repas sans estimation, non compté{day.entriesWithoutEstimate > 1 ? "s" : ""}. Demande à
            Claude de les estimer, ou complète-les.
          </p>
        )}
      </section>

      <section className="paper mt-4 p-4">
        <h2 className="mb-3 font-semibold">Noter un repas</h2>
        <QuickAdd key={date} date={date} defaultSlot={date === t ? slotForNow() : "lunch"} suggestions={suggestions} />
      </section>

      <section className="paper mt-4 p-4">
        <h2 className="mb-2 font-semibold">Mangé ce jour-là</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-stone-500">Rien de noté pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-dashed divide-black/10">
            {entries.map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-stone-500">{LOG_SLOT_LABELS[e.slot]}</p>
                    <p className="break-words">
                      {e.recipeId ? (
                        <Link href={`/recettes/${e.recipeId}`} className="underline decoration-stone-300">
                          {e.description}
                        </Link>
                      ) : (
                        e.description
                      )}
                      {e.servings !== null && e.recipeId !== null && (
                        <span className="text-stone-500"> · {e.servings} portion{e.servings > 1 ? "s" : ""}</span>
                      )}
                    </p>
                    <p className="text-sm text-stone-600">
                      {e.estKcal !== null ? `${Math.round(e.estKcal)} kcal` : "kcal ?"} ·{" "}
                      {e.estProteinG !== null ? `${Math.round(e.estProteinG)} g prot.` : "prot. ?"}
                    </p>
                    {e.notes && <p className="text-sm text-stone-500">{e.notes}</p>}
                  </div>
                  <form action={removeEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="p-1.5 text-stone-400 hover:text-red-600" aria-label={`Supprimer ${e.description}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
                <EditEntry entry={e} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="paper mt-4 p-4">
        <summary className="cursor-pointer font-semibold">
          Mes objectifs : {Math.round(targets.kcalPerDay)} kcal · {Math.round(targets.proteinG)} g de protéines
        </summary>
        {targets.notes && <p className="mt-2 text-sm text-stone-500">{targets.notes}</p>}
        <TargetsForm kcal={targets.kcalPerDay} protein={targets.proteinG} notes={targets.isDefault ? null : targets.notes} />
      </details>
    </>
  );
}
