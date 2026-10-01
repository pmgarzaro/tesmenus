"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMinutes } from "@/lib/labels";
import { type FridgeRecipe, matchFridge } from "@/lib/recipes/fridge";
import { fold } from "@/lib/recipes/normalize";
import { capitalize } from "@/lib/shopping/aggregate";

export function FridgeFinder({ recipes, suggestions, pantry }: { recipes: FridgeRecipe[]; suggestions: string[]; pantry: string[] }) {
  const [owned, setOwned] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const results = useMemo(() => matchFridge(recipes, owned, pantry), [recipes, owned, pantry]);

  const add = (raw: string) => {
    const items = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    setOwned((o) => [...o, ...items.filter((i) => !o.some((x) => fold(x) === fold(i)))]);
    setDraft("");
  };
  const hints = draft.trim().length >= 2 ? suggestions.filter((s) => fold(s).includes(fold(draft)) && !owned.includes(s)).slice(0, 6) : [];

  return (
    <div className="space-y-4">
      <section className="space-y-2 paper p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) add(draft);
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ce que tu as : poulet, courgettes, crème…"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5"
          />
          <button className="btn-primary px-4 font-semibold text-white" aria-label="Ajouter">+</button>
        </form>
        {hints.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hints.map((h) => (
              <button key={h} onClick={() => add(h)} className="rounded-full border border-stone-300 px-2.5 py-0.5 text-sm">
                + {h}
              </button>
            ))}
          </div>
        )}
        {owned.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {owned.map((o) => (
              <button key={o} onClick={() => setOwned(owned.filter((x) => x !== o))} className="rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-700">
                {o} ✕
              </button>
            ))}
            <button onClick={() => setOwned([])} className="px-2 text-sm text-stone-500 underline">Tout effacer</button>
          </div>
        )}
        <p className="text-xs text-stone-500">Sel, poivre, huile et les articles « toujours au placard » sont considérés comme disponibles.</p>
      </section>

      {owned.length > 0 && results.length === 0 && (
        <p className="p-4 text-center text-stone-500">Aucune recette n&apos;utilise ces ingrédients.</p>
      )}
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.id}>
            <Link href={`/recettes/${r.id}`} className="block paper p-3">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{r.title}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold ${
                    r.score === 100 ? "bg-green-100 text-green-800" : r.score >= 60 ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {r.score} %
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-stone-500">
                {r.missing.length === 0 ? "✓ Tu as tout" : `Il manque : ${r.missing.map(capitalize).join(", ")}`}
                {r.minutes > 0 && ` · ${formatMinutes(r.minutes)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
