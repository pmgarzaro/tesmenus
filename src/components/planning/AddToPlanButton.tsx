"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { editCell } from "@/app/(app)/planning/actions";
import { longDate, shortDate } from "@/lib/planning/dates";

type OpenPlan = {
  id: number;
  startDate: string;
  days: number;
  entries: { id: number; date: string; slot: "midi" | "soir"; content: string | null }[];
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** From a recipe page: put this recipe on a meal of an upcoming plan. */
export function AddToPlanButton({ recipeId, plans }: { recipeId: number; plans: OpenPlan[] }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ planId: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (plan: OpenPlan, e: OpenPlan["entries"][number]) =>
    start(async () => {
      setError(null);
      const err = await editCell(plan.id, e.id, { type: "recipe", recipeId });
      if (err) setError(err);
      else setDone({ planId: plan.id, label: `${shortDate(e.date)} ${e.slot}` });
    });

  return (
    <>
      <button
        onClick={() => {
          setDone(null);
          setOpen(true);
        }}
        className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white"
      >
        📅 Ajouter au planning
      </button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Ajouter au planning"
            onClick={(ev) => ev.stopPropagation()}
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl"
          >
            <h2 className="mb-3 text-lg font-semibold">Ajouter au planning</h2>
            {done ? (
              <div className="space-y-3">
                <p className="rounded-xl bg-green-50 p-3 text-green-800">✓ Ajouté pour {done.label}.</p>
                <Link href={`/planning/${done.planId}`} className="block text-center font-medium text-brand-700 underline">
                  Voir le planning
                </Link>
              </div>
            ) : plans.length === 0 ? (
              <p className="text-stone-600">
                Aucun planning en cours.{" "}
                <Link href="/planning/nouveau" className="text-brand-700 underline">Créer un planning</Link>
              </p>
            ) : (
              <div className="space-y-4">
                {error && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{error}</p>}
                {plans.map((plan) => (
                  <section key={plan.id} className="space-y-2">
                    {plans.length > 1 && <h3 className="text-sm text-stone-500">Semaine du {longDate(plan.startDate)}</h3>}
                    <ul className="space-y-1.5">
                      {plan.entries.map((e) => (
                        <li key={e.id}>
                          <button
                            disabled={pending}
                            onClick={() => choose(plan, e)}
                            className="flex w-full items-baseline gap-3 rounded-xl border border-stone-200 px-3 py-2 text-left disabled:opacity-50"
                          >
                            <span className="w-28 shrink-0 text-sm font-medium">{cap(shortDate(e.date))} {e.slot}</span>
                            <span className={`min-w-0 truncate text-sm ${e.content ? "text-stone-500" : "text-brand-700"}`}>
                              {e.content ? `remplace : ${e.content}` : "libre"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            <button onClick={() => setOpen(false)} className="mt-3 w-full py-2 text-stone-500">Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}
