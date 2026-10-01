"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MEAL_TYPES } from "@/db/schema";
import { MEAL_TYPE_LABELS } from "@/lib/labels";

const MAX_TIMES = [15, 30, 45, 60, 90];
const select = "rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm";

/** Search box + filters, all stored in the URL so the server does the filtering. */
export function LibraryFilters({ tags }: { tags: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const activeTags = params.getAll("tag");

  const update = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounced search.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update((p) => (q ? p.set("q", q) : p.delete("q"))), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggleTag = (tag: string) =>
    update((p) => {
      const current = p.getAll("tag");
      p.delete("tag");
      const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
      next.forEach((t) => p.append("tag", t));
    });

  const filtered = params.size > 0;

  return (
    <div className="mb-4 space-y-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher une recette, un ingrédient…"
        aria-label="Rechercher"
        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 outline-none focus:border-brand-500"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={params.get("type") ?? ""}
          onChange={(e) => update((p) => (e.target.value ? p.set("type", e.target.value) : p.delete("type")))}
          aria-label="Type de repas"
          className={select}
        >
          <option value="">Tous types</option>
          {MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_TYPE_LABELS[t]}</option>)}
        </select>
        <select
          value={params.get("max") ?? ""}
          onChange={(e) => update((p) => (e.target.value ? p.set("max", e.target.value) : p.delete("max")))}
          aria-label="Temps total maximum"
          className={select}
        >
          <option value="">Tout temps</option>
          {MAX_TIMES.map((m) => <option key={m} value={m}>≤ {m} min</option>)}
        </select>
        <label className={`${select} flex items-center gap-1.5`}>
          <input
            type="checkbox"
            checked={params.get("congelable") === "1"}
            onChange={(e) => update((p) => (e.target.checked ? p.set("congelable", "1") : p.delete("congelable")))}
            className="accent-brand-600"
          />
          Congelable
        </label>
        {filtered && (
          <button
            onClick={() => {
              setQ("");
              router.replace(pathname, { scroll: false });
            }}
            className="px-2 text-sm text-stone-500 underline"
          >
            Effacer
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {tags.map((t) => {
            const on = activeTags.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                aria-pressed={on}
                className={`shrink-0 rounded-full px-3 py-1 text-sm ${
                  on ? "bg-brand-600 text-white" : "border border-stone-300 bg-white text-stone-700"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
