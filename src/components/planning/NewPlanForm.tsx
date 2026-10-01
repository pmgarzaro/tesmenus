"use client";

import { Dices, PenLine, Sparkles, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createPlanAction } from "@/app/(app)/planning/actions";
import { fold } from "@/lib/recipes/normalize";
import { dateRange, shortDate } from "@/lib/planning/dates";
import { formatMinutes } from "@/lib/labels";

type Recipe = { id: number; title: string; totalMinutes: number };
const MAX_TIMES = [15, 20, 30, 45, 60, 90];
const box = "space-y-3 paper p-4";
const field = "rounded-lg border border-stone-300 bg-white px-3 py-2";

export function NewPlanForm({
  defaults,
  recipes,
  tags,
  aiAvailable,
}: {
  defaults: { startDate: string; days: number; slots: ("midi" | "soir")[] };
  recipes: Recipe[];
  tags: string[];
  aiAvailable: boolean;
}) {
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [days, setDays] = useState(defaults.days);
  const [slots, setSlots] = useState(defaults.slots);
  const [maxByDate, setMaxByDate] = useState<Record<string, number>>({});
  const [include, setInclude] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [onlyFreezable, setOnlyFreezable] = useState(false);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dates = useMemo(() => (startDate && days > 0 && days <= 14 ? dateRange(startDate, days) : []), [startDate, days]);
  const matches = query.trim()
    ? recipes.filter((r) => !include.includes(r.id) && fold(r.title).includes(fold(query))).slice(0, 6)
    : [];

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const err = await createPlanAction({
        startDate,
        days,
        slots,
        maxMinutesByDate: maxByDate,
        include,
        onlyFreezable,
        excludeTags,
        mode,
        request: request.trim() || undefined,
      });
      if (err) setError(err);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="Remplissage" className="grid grid-cols-2 gap-2">
        {(
          [
            ["auto", "Automatique", "L'appli choisit les repas, tu ajustes ensuite.", Dices],
            ["manual", "Je remplis moi-même", "Planning vide, tu choisis chaque repas.", PenLine],
          ] as const
        ).map(([value, label, hint, Icon]) => (
          <button
            type="button"
            key={value}
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-2xl border-2 p-3 text-left ${mode === value ? "border-brand-600 bg-brand-50" : "border-stone-200 bg-white"}`}
          >
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon className="size-4 text-brand-700" aria-hidden />
              {label}
            </span>
            <span className="block text-xs text-stone-500">{hint}</span>
          </button>
        ))}
      </div>

      <section className={box}>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-stone-600">
            Début
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={`${field} w-full`} />
          </label>
          <label className="text-sm text-stone-600">
            Nombre de jours
            <input type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} required className={`${field} w-full`} />
          </label>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-stone-600">Repas :</span>
          {(["midi", "soir"] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 capitalize">
              <input type="checkbox" checked={slots.includes(s)} onChange={() => setSlots(toggle(slots, s))} className="size-5 accent-brand-600" />
              {s}
            </label>
          ))}
        </div>
      </section>

      {aiAvailable && (
        <section className={`${box} border border-violet-200`}>
          <label className="block space-y-2">
            <span className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="size-4 text-violet-600" aria-hidden /> Demande libre
            </span>
            <span className="block text-sm text-stone-500">
              Dis ce que tu veux, l&apos;IA le transforme en contraintes. Ex. : « léger mardi et jeudi, on mange au resto
              vendredi soir, pas de poisson, mettre le chili ».
            </span>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Facultatif"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
            />
          </label>
        </section>
      )}

      <section className={box}>
        <h2 className="font-semibold">
          {mode === "auto" ? "Contraintes (facultatif)" : "Contraintes pour « Compléter au hasard » (facultatif)"}
        </h2>
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-700">Temps maximum par jour</summary>
          <ul className="mt-2 space-y-1.5">
            {dates.map((d) => (
              <li key={d} className="flex items-center justify-between gap-2">
                <span>{shortDate(d).charAt(0).toUpperCase() + shortDate(d).slice(1)}</span>
                <select
                  value={maxByDate[d] ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMaxByDate((m) => {
                      const next = { ...m };
                      if (v) next[d] = v;
                      else delete next[d];
                      return next;
                    });
                  }}
                  aria-label={`Temps maximum ${shortDate(d)}`}
                  className={`${field} py-1`}
                >
                  <option value="">pas de limite</option>
                  {MAX_TIMES.map((m) => <option key={m} value={m}>≤ {m} min</option>)}
                </select>
              </li>
            ))}
          </ul>
        </details>

        <div className="space-y-2 text-sm">
          <span className="text-stone-700">Recettes à inclure</span>
          <div className="flex flex-wrap gap-1.5">
            {include.map((id) => (
              <button
                type="button"
                key={id}
                onClick={() => setInclude(include.filter((x) => x !== id))}
                className="rounded-full bg-brand-100 px-3 py-1 text-brand-700"
              >
                {recipes.find((r) => r.id === id)?.title} <X className="inline size-3.5 align-[-2px]" aria-hidden />
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une recette à inclure…"
            className={`${field} w-full`}
          />
          {matches.length > 0 && (
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
              {matches.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setInclude([...include, r.id]);
                      setQuery("");
                    }}
                    className="flex w-full justify-between px-3 py-2 text-left"
                  >
                    {r.title}
                    <span className="text-stone-400">{formatMinutes(r.totalMinutes)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyFreezable} onChange={(e) => setOnlyFreezable(e.target.checked)} className="size-5 accent-brand-600" />
          Uniquement des plats congelables
        </label>

        {tags.length > 0 && (
          <div className="space-y-2 text-sm">
            <span className="text-stone-700">Éviter cette semaine</span>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = excludeTags.includes(t);
                return (
                  <button
                    type="button"
                    key={t}
                    aria-pressed={on}
                    onClick={() => setExcludeTags(toggle(excludeTags, t))}
                    className={`rounded-full px-3 py-1 ${on ? "bg-stone-800 text-white line-through" : "border border-stone-300 text-stone-700"}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={pending || slots.length === 0} className="w-full btn-primary py-3 font-semibold text-white disabled:opacity-60">
        {pending
          ? request.trim()
            ? "L'IA lit ta demande…"
            : "Création…"
          : mode === "auto"
            ? "Générer le planning"
            : "Créer le planning vide"}
      </button>
    </form>
  );
}
