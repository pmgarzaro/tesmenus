"use client";

import { ArrowLeftRight, BookOpen, Dices, Eye, NotebookPen, PenLine, Repeat2, Trash2, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { type CellAction, editCell } from "@/app/(app)/planning/actions";
import { SLOT_LABELS, formatMinutes } from "@/lib/labels";
import { type Slot, isBreakfast, slotOrder } from "@/lib/planning/generate";
import { shortDate, weekdayName } from "@/lib/planning/dates";
import { magnetAt } from "@/lib/notes";
import { fold } from "@/lib/recipes/normalize";

export type GridEntry = {
  id: number;
  date: string;
  slot: Slot;
  recipeId: number | null;
  servings: number | null;
  isLeftover: boolean;
  isEatingOut: boolean;
  label: string | null;
  note: string | null;
  hasLeftovers: boolean;
  recipe: { id: number; title: string; tags: string[]; minutes: number } | null;
  source: { id: number; date: string; slot: Slot } | null;
};
type PickerRecipe = { id: number; title: string; minutes: number; tags: string[]; breakfast?: boolean };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (e: { date: string; slot: Slot }) => `${weekdayName(e.date)} ${e.slot}`;
const order = (e: GridEntry) => `${e.date}|${slotOrder(e.slot)}`;
const sameKind = (a: GridEntry, b: GridEntry) => isBreakfast(a.slot) === isBreakfast(b.slot);

export function PlanGrid({ planId, entries, recipes, today }: { planId: number; entries: GridEntry[]; recipes: PickerRecipe[]; today: string }) {
  // Ids, so the sheet always shows the latest data after an edit.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const setSelected = (e: GridEntry | null) => setSelectedId(e?.id ?? null);
  const [swapFrom, setSwapFrom] = useState<GridEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (entry: GridEntry, action: CellAction, close = true) =>
    start(async () => {
      setError(null);
      const err = await editCell(planId, entry.id, action);
      if (err) setError(err);
      else if (close) setSelected(null);
    });

  const dates = [...new Set(entries.map((e) => e.date))];

  const onCell = (e: GridEntry) => {
    if (swapFrom) {
      if (e.id !== swapFrom.id) run(swapFrom, { type: "swap", otherId: e.id });
      setSwapFrom(null);
      return;
    }
    setError(null);
    setSelected(e);
  };

  return (
    <>
      {swapFrom && (
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-xl bg-stone-800 px-4 py-2 text-sm text-white">
          <span>Touche le repas à échanger avec « {swapFrom.recipe?.title ?? "vide"} »</span>
          <button onClick={() => setSwapFrom(null)} className="underline">Annuler</button>
        </div>
      )}
      {error && !selected && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className={`grid grid-cols-1 gap-x-4 gap-y-6 pt-2 sm:grid-cols-2 ${pending ? "opacity-70" : ""}`}>
        {dates.map((date, i) => (
          <section
            key={date}
            className={`paper min-w-0 border-2 px-4 pb-1 pt-3 ${date === today ? "border-magnet-red" : "border-transparent"}`}
          >
            <h2 className="mb-1 flex items-center gap-2.5">
              <span className={`magnet ${magnetAt(i)}`} aria-hidden="true" />
              {capitalize(shortDate(date))}
              {date === today && <span className="ml-auto rounded-full bg-brand-600 px-2.5 py-0.5 text-sm text-white">aujourd&apos;hui</span>}
            </h2>
            <ul className="divide-y divide-stone-100">
              {entries.filter((e) => e.date === date).map((e) => {
                const swappable = !swapFrom || (!e.isLeftover && e.id !== swapFrom.id && sameKind(e, swapFrom));
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => onCell(e)}
                      disabled={!swappable}
                      className={`flex min-h-13 w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left disabled:opacity-40 ${
                        swapFrom && swappable ? "bg-brand-50 outline-2 outline-brand-500" : ""
                      }`}
                    >
                      <span className="w-12 shrink-0 font-display text-sm font-semibold uppercase text-stone-500">{SLOT_LABELS[e.slot]}</span>
                      <Cell e={e} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {selected && (
        <CellSheet
          key={`${selected.id}-${selected.recipeId}-${selected.servings}-${selected.label}-${selected.note}`}
          entry={selected}
          entries={entries}
          recipes={recipes}
          pending={pending}
          error={error}
          onClose={() => setSelected(null)}
          onAction={(a, close) => run(selected, a, close)}
          onSwap={() => {
            setSwapFrom(selected);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}

function Cell({ e }: { e: GridEntry }) {
  return (
    <span className="min-w-0 flex-1">
      <CellContent e={e} />
      {e.note && <span className="mt-0.5 block text-xs italic text-stone-500">📝 {e.note}</span>}
    </span>
  );
}

function CellContent({ e }: { e: GridEntry }) {
  if (e.label) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-stone-700">
        {e.isEatingOut ? <UtensilsCrossed className="size-4 shrink-0" aria-hidden /> : <PenLine className="size-4 shrink-0" aria-hidden />}
        <span className="truncate font-medium">{e.label}</span>
      </span>
    );
  }
  if (e.isEatingOut) {
    return (
      <span className="inline-flex items-center gap-1.5 text-stone-500">
        <UtensilsCrossed className="size-4" aria-hidden /> Repas extérieur
      </span>
    );
  }
  if (e.isLeftover && e.recipe) {
    return (
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-stone-700">
          <Repeat2 className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Restes : {e.recipe.title}</span>
        </span>
        {e.source && <span className="block text-xs text-stone-400">du {when(e.source)}</span>}
      </span>
    );
  }
  if (!e.recipe) return <span className="block rounded-xl border-2 border-dashed border-stone-300 px-3 py-1.5 text-stone-500">+ Choisir une recette</span>;
  return (
    <span className="min-w-0">
      <span className="block truncate font-bold">{e.recipe.title}</span>
      <span className="block text-xs text-stone-500">
        {[`${e.servings} portions`, formatMinutes(e.recipe.minutes), e.hasLeftovers && "restes prévus"].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

function CellSheet({
  entry: e,
  entries,
  recipes,
  pending,
  error,
  onClose,
  onAction,
  onSwap,
}: {
  entry: GridEntry;
  entries: GridEntry[];
  recipes: PickerRecipe[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onAction: (a: CellAction, close?: boolean) => void;
  onSwap: () => void;
}) {
  // An empty meal opens straight on the recipe list.
  const [picking, setPicking] = useState(!e.recipe && !e.isEatingOut && !e.label);
  const [label, setLabel] = useState(e.label ?? "");
  const [labelOut, setLabelOut] = useState(e.isEatingOut);
  const [note, setNote] = useState(e.note ?? "");
  const [query, setQuery] = useState("");
  const [servings, setServings] = useState(e.servings ?? 2);
  const cooks = !e.isLeftover && !e.isEatingOut && e.recipe;
  // Earlier cooked meals whose leftovers this meal could eat.
  const sources = entries
    .filter((x) => !x.isLeftover && x.recipeId && order(x) < order(e) && sameKind(x, e))
    .slice(-3)
    .reverse();
  // Breakfast recipes for breakfasts, the others for lunch and dinner (all if none fits).
  const fitting = recipes.filter((r) => !!r.breakfast === isBreakfast(e.slot));
  const shown = (fitting.length ? fitting : recipes).filter(
    (r) => !query.trim() || fold(r.title + " " + r.tags.join(" ")).includes(fold(query)),
  );
  const btn = "flex w-full items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5 text-left disabled:opacity-50";
  const ico = "size-5 shrink-0 text-brand-700";

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Modifier le repas"
        onClick={(ev) => ev.stopPropagation()}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl"
      >
        <p className="text-sm text-stone-500">{capitalize(when(e))}</p>
        <h2 className="mb-3 text-lg font-semibold">
          {e.label ?? (e.isEatingOut ? "Repas extérieur" : e.recipe ? (e.isLeftover ? `Restes : ${e.recipe.title}` : e.recipe.title) : "Rien de prévu")}
        </h2>
        {error && <p className="mb-3 rounded-xl bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        {picking ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Chercher une recette…"
              className="w-full rounded-xl border border-stone-300 px-3 py-2"
            />
            <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    disabled={pending}
                    onClick={() => onAction({ type: "recipe", recipeId: r.id })}
                    className="flex w-full justify-between gap-2 px-1 py-2.5 text-left"
                  >
                    <span>{r.title}</span>
                    <span className="shrink-0 text-sm text-stone-400">{formatMinutes(r.minutes)}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="py-3 text-center text-sm text-stone-500">Aucune recette.</li>}
            </ul>
            <button onClick={() => setPicking(false)} className="w-full py-2 text-stone-500">
              {e.recipe || e.isEatingOut || e.label ? "Retour" : "Autres options (hasard, restes, texte libre, note…)"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {cooks && (
              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2">
                <span className="text-sm">Portions cuisinées</span>
                <span className="flex items-center gap-2">
                  <button className="size-8 rounded-full border border-stone-300" disabled={servings <= 1} onClick={() => setServings(servings - 1)} aria-label="Moins">−</button>
                  <strong className="w-6 text-center">{servings}</strong>
                  <button className="size-8 rounded-full border border-stone-300" onClick={() => setServings(servings + 1)} aria-label="Plus">+</button>
                  {servings !== e.servings && (
                    <button disabled={pending} onClick={() => onAction({ type: "servings", servings }, false)} className="ml-1 rounded-lg bg-stone-800 px-2 py-1 text-xs text-white">
                      OK
                    </button>
                  )}
                </span>
              </div>
            )}
            {!e.isLeftover && (
              <button className={btn} disabled={pending} onClick={() => onAction({ type: "reroll" }, false)}>
                <Dices className={ico} aria-hidden /> {e.recipe ? "Autre recette au hasard" : "Une recette au hasard"}
              </button>
            )}
            <button className={btn} disabled={pending} onClick={() => setPicking(true)}>
              <BookOpen className={ico} aria-hidden /> Choisir une recette
            </button>
            {!e.isLeftover && (
              <button className={btn} disabled={pending} onClick={onSwap}>
                <ArrowLeftRight className={ico} aria-hidden /> Échanger avec un autre repas
              </button>
            )}
            {sources.map((s) => (
              <button key={s.id} className={btn} disabled={pending || e.source?.id === s.id} onClick={() => onAction({ type: "leftover", sourceId: s.id })}>
                <Repeat2 className={ico} aria-hidden /> Restes du {when(s)} ({s.recipe?.title})
              </button>
            ))}
            {(!e.isEatingOut || e.label) && (
              <button className={btn} disabled={pending} onClick={() => onAction({ type: "out" })}>
                <UtensilsCrossed className={ico} aria-hidden /> Repas extérieur
              </button>
            )}
            <form
              className="space-y-2 rounded-xl border border-stone-200 p-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (label.trim()) onAction({ type: "label", label, eatingOut: labelOut });
              }}
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <PenLine className={ico} aria-hidden /> Sans recette
              </label>
              <input
                value={label}
                onChange={(ev) => setLabel(ev.target.value)}
                maxLength={120}
                placeholder="Raclette, salade au thon, chez les beaux-parents…"
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-sm text-stone-600">
                  <input type="checkbox" checked={labelOut} onChange={(ev) => setLabelOut(ev.target.checked)} className="size-4 accent-brand-600" />
                  Pas à la maison
                </label>
                <button disabled={pending || !label.trim()} className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-40">
                  OK
                </button>
              </div>
            </form>
            <form
              className="space-y-2 rounded-xl border border-stone-200 p-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                onAction({ type: "note", note }, false);
              }}
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <NotebookPen className={ico} aria-hidden /> Note pour ce repas
              </label>
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  maxLength={300}
                  placeholder="200 g de lieu et de pommes de terre…"
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2"
                />
                <button disabled={pending || note === (e.note ?? "")} className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-40">
                  OK
                </button>
              </div>
            </form>
            {(e.recipe || e.isEatingOut || e.label || e.note) && (
              <button className={btn} disabled={pending} onClick={() => onAction({ type: "empty" })}>
                <Trash2 className={ico} aria-hidden /> Vider
              </button>
            )}
            {e.recipe && (
              <Link href={`/recettes/${e.recipe.id}`} className={btn}>
                <Eye className={ico} aria-hidden /> Voir la recette
              </Link>
            )}
            <button onClick={onClose} className="w-full py-2 text-stone-500">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}
