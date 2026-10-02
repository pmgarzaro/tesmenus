"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSessionAction } from "@/app/(app)/batch/actions";
import { formatMinutes } from "@/lib/labels";
import { longDate, shortDate } from "@/lib/planning/dates";
import { fold } from "@/lib/recipes/normalize";

type Candidate = { entryId: number; date: string; slot: string; title: string; servings: number; eatDates: string[] };
type Recipe = { id: number; title: string; servings: number; minutes: number };
type PlanOption = { id: number; startDate: string };

export function NewBatchForm({
  plans,
  planId,
  candidates,
  recipes,
  defaultDate,
}: {
  plans: PlanOption[];
  planId: number | null;
  candidates: Candidate[];
  recipes: Recipe[];
  defaultDate: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>(candidates.map((c) => c.entryId));
  const [extra, setExtra] = useState<{ recipeId: number; servings: number }[]>([]);
  const [query, setQuery] = useState("");
  const [sessionDate, setSessionDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const total = selected.length + extra.length;
  const matches = query.trim() ? recipes.filter((r) => fold(r.title).includes(fold(query))).slice(0, 6) : [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const err = await createSessionAction({ planId, sessionDate, entryIds: selected, extra });
          if (err) setError(err);
        });
      }}
      className="space-y-4"
    >
      <section className="space-y-3 paper p-4">
        <label className="block text-sm text-stone-600">
          Jour de la session
          <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} required className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
        </label>
        {plans.length > 0 && (
          <label className="block text-sm text-stone-600">
            Planning
            <select
              value={planId ?? ""}
              onChange={(e) => router.replace(`/batch/nouveau${e.target.value ? `?plan=${e.target.value}` : "?plan=none"}`)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            >
              {plans.map((p) => <option key={p.id} value={p.id}>Semaine du {longDate(p.startDate)}</option>)}
              <option value="">Aucun (recettes de la bibliothèque)</option>
            </select>
          </label>
        )}
      </section>

      {candidates.length > 0 && (
        <section className="space-y-2 paper p-4">
          <h2 className="font-semibold">Repas du planning</h2>
          <ul className="space-y-1">
            {candidates.map((c) => (
              <li key={c.entryId}>
                <label className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.entryId)}
                    onChange={() => setSelected(selected.includes(c.entryId) ? selected.filter((x) => x !== c.entryId) : [...selected, c.entryId])}
                    className="size-5 accent-brand-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.title}</span>
                    <span className="block text-xs text-stone-500">
                      {c.servings} portions · mangé {c.eatDates.map(shortDate).join(", ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 paper p-4">
        <h2 className="font-semibold">Ajouter une recette de la bibliothèque</h2>
        {extra.map((x, i) => {
          const r = recipes.find((y) => y.id === x.recipeId)!;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <input
                type="number"
                min={1}
                max={50}
                value={x.servings}
                onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, servings: Number(e.target.value) } : y)))}
                aria-label={`Portions ${r.title}`}
                className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-right"
              />
              portions
              <button type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))} aria-label={`Retirer ${r.title}`} className="px-2 text-stone-400"><X className="size-4" aria-hidden /></button>
            </div>
          );
        })}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher une recette…"
          className="w-full rounded-lg border border-stone-300 px-3 py-2"
        />
        {matches.length > 0 && (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {matches.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setExtra([...extra, { recipeId: r.id, servings: r.servings }]);
                    setQuery("");
                  }}
                  className="flex w-full justify-between px-3 py-2 text-left"
                >
                  {r.title}
                  <span className="text-stone-400">{formatMinutes(r.minutes)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={pending || total < 2} className="w-full btn-primary py-3 font-semibold text-white disabled:opacity-50">
        {pending ? "Préparation de la fiche…" : total < 2 ? "Choisis au moins 2 plats" : `Créer la fiche (${total} plats)`}
      </button>
    </form>
  );
}
