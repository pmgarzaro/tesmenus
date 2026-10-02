"use client";

import { Check, Ellipsis, House, Infinity, RotateCw, Share2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { type ShopAction, shopAction } from "@/app/(app)/courses/actions";
import { AISLE_LABELS } from "@/lib/labels";
import { magnetAt } from "@/lib/notes";
import { AISLE_ORDER, capitalize, toText } from "@/lib/shopping/aggregate";
import type { ListItem, ManualItem } from "@/lib/shopping/repo";

type State = { items: ListItem[]; manual: ManualItem[] };

/** Applies an action locally, so ticking a box feels instant in the shop. */
function reduce(s: State, a: ShopAction): State {
  switch (a.type) {
    case "check":
      return { ...s, items: s.items.map((i) => (i.ingredientId === a.ingredientId ? { ...i, checked: a.checked } : i)) };
    case "remove":
      return { ...s, items: s.items.map((i) => (i.ingredientId === a.ingredientId ? { ...i, removed: a.removed } : i)) };
    case "pantry":
      return { ...s, items: s.items.map((i) => (i.name === a.name ? { ...i, pantry: a.inPantry } : i)) };
    case "checkManual":
      return { ...s, manual: s.manual.map((m) => (m.id === a.id ? { ...m, checked: a.checked } : m)) };
    case "deleteManual":
      return { ...s, manual: s.manual.filter((m) => m.id !== a.id) };
    case "uncheckAll":
      return { items: s.items.map((i) => ({ ...i, checked: false })), manual: s.manual.map((m) => ({ ...m, checked: false })) };
    default:
      return s;
  }
}

type Row =
  | { kind: "item"; item: ListItem; checked: boolean }
  | { kind: "manual"; item: ManualItem; checked: boolean };

export function ShoppingList({ planId, title, items, manual }: { planId: number; title: string } & State) {
  const router = useRouter();
  const [state, apply] = useOptimistic<State, ShopAction>({ items, manual }, reduce);
  const [, start] = useTransition();
  const [menuFor, setMenuFor] = useState<ListItem | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const act = (a: ShopAction) =>
    start(async () => {
      apply(a);
      await shopAction(planId, a);
    });

  // Two phones in the shop: refresh when coming back to the app.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const active = state.items.filter((i) => !i.removed && !i.pantry);
  const rows: (Row & { aisle: (typeof AISLE_ORDER)[number] })[] = [
    ...active.map((item) => ({ kind: "item" as const, item, checked: item.checked, aisle: item.aisle })),
    ...state.manual.map((item) => ({ kind: "manual" as const, item, checked: item.checked, aisle: item.aisle })),
  ];
  const done = rows.filter((r) => r.checked).length;
  const removed = state.items.filter((i) => i.removed && !i.pantry);
  const pantry = state.items.filter((i) => i.pantry);

  const text = () =>
    toText({
      title,
      items: rows
        .filter((r) => !r.checked)
        .map((r) =>
          r.kind === "item"
            ? { name: r.item.name, amount: r.item.amount, aisle: r.aisle }
            : { name: r.item.label, amount: "", aisle: r.aisle },
        ),
    });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          const t = draft;
          setDraft("");
          start(async () => {
            await shopAction(planId, { type: "add", text: t });
            router.refresh();
          });
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ajouter un article (papier toilette, 1 l de lait…)"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5"
        />
        <button className="btn-primary px-4 font-semibold text-white" aria-label="Ajouter">+</button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-medium">
          {done}/{rows.length} dans le panier
        </span>
        <button
          onClick={async () => {
            const t = text();
            if (navigator.share) {
              try {
                await navigator.share({ title, text: t });
                return;
              } catch {}
            }
            await navigator.clipboard.writeText(t);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-brand-700 underline"
        >
          {copied ? (
            <>
              <Check className="mr-1 inline size-4 align-[-3px]" aria-hidden />
              Copié
            </>
          ) : (
            <>
              <Share2 className="mr-1 inline size-4 align-[-3px]" aria-hidden />
              Partager / copier
            </>
          )}
        </button>
        {done > 0 && (
          <button onClick={() => act({ type: "uncheckAll" })} className="text-stone-500 underline">Tout décocher</button>
        )}
        <button onClick={() => router.refresh()} className="text-stone-500 underline" aria-label="Rafraîchir">
          <RotateCw className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
          Rafraîchir
        </button>
      </div>

      {rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-500">
          Rien à acheter : le planning ne contient pas encore de recettes.
        </p>
      )}

      {AISLE_ORDER.map((aisle, aisleIndex) => {
        const inAisle = rows.filter((r) => r.aisle === aisle).sort((a, b) => Number(a.checked) - Number(b.checked));
        if (inAisle.length === 0) return null;
        return (
          <section key={aisle} className="paper px-3 pb-1 pt-3">
            <h2 className="flex items-center gap-2.5 px-1 pb-1">
              <span className={`magnet ${magnetAt(aisleIndex)}`} aria-hidden="true" />
              {AISLE_LABELS[aisle]}
            </h2>
            <ul className="divide-y divide-stone-100">
              {inAisle.map((r) => {
                const key = r.kind === "item" ? `i${r.item.ingredientId}` : `m${r.item.id}`;
                const toggle = () =>
                  act(
                    r.kind === "item"
                      ? { type: "check", ingredientId: r.item.ingredientId, checked: !r.checked }
                      : { type: "checkManual", id: r.item.id, checked: !r.checked },
                  );
                return (
                  <li key={key} className="flex items-center gap-1">
                    <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3 px-1 py-1">
                      <input type="checkbox" checked={r.checked} onChange={toggle} className="size-6 shrink-0 accent-magnet-green" />
                      <span className={`min-w-0 flex-1 ${r.checked ? "text-stone-400 line-through" : ""}`}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-bold">{capitalize(r.kind === "item" ? r.item.name : r.item.label)}</span>
                          {r.kind === "item" && <span className="shrink-0 text-sm font-medium">{r.item.amount}</span>}
                        </span>
                        {r.kind === "item" && !r.checked && (
                          <span className="block truncate text-xs text-stone-500">
                            {r.item.optional && "facultatif · "}
                            {r.item.recipes.join(", ")}
                          </span>
                        )}
                      </span>
                    </label>
                    <button
                      onClick={() => (r.kind === "item" ? setMenuFor(r.item) : act({ type: "deleteManual", id: r.item.id }))}
                      aria-label={r.kind === "item" ? `Options ${r.item.name}` : `Supprimer ${r.item.label}`}
                      className="shrink-0 rounded-lg px-2 py-2 text-stone-400"
                    >
                      {r.kind === "item" ? <Ellipsis className="size-5" aria-hidden /> : <X className="size-4" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {(removed.length > 0 || pantry.length > 0) && (
        <section className="space-y-2 rounded-2xl bg-stone-100 p-3 text-sm">
          {removed.length > 0 && (
            <details>
              <summary className="cursor-pointer text-stone-600">Déjà au placard cette semaine ({removed.length})</summary>
              <ul className="mt-2 space-y-1">
                {removed.map((i) => (
                  <li key={i.ingredientId} className="flex justify-between gap-2">
                    <span>{capitalize(i.name)} <span className="text-stone-400">{i.amount}</span></span>
                    <button onClick={() => act({ type: "remove", ingredientId: i.ingredientId, removed: false })} className="text-brand-700 underline">
                      Remettre
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {pantry.length > 0 && (
            <details>
              <summary className="cursor-pointer text-stone-600">Toujours au placard ({pantry.length})</summary>
              <ul className="mt-2 space-y-1">
                {pantry.map((i) => (
                  <li key={i.ingredientId} className="flex justify-between gap-2">
                    <span>{capitalize(i.name)} <span className="text-stone-400">{i.amount}</span></span>
                    <button onClick={() => act({ type: "pantry", name: i.name, inPantry: false })} className="text-brand-700 underline">
                      Remettre
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {menuFor && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setMenuFor(null)}>
          <div
            role="dialog"
            aria-label={`Options ${menuFor.name}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full space-y-2 rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl"
          >
            <h2 className="text-lg font-semibold">{capitalize(menuFor.name)}</h2>
            <p className="text-sm text-stone-500">
              {menuFor.amount && `${menuFor.amount} · `}pour {menuFor.recipes.join(", ")}
            </p>
            <button
              onClick={() => {
                act({ type: "remove", ingredientId: menuFor.ingredientId, removed: true });
                setMenuFor(null);
              }}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-left"
            >
              <House className="mr-2 inline size-5 align-[-4px] text-brand-700" aria-hidden />
              Déjà au placard (cette semaine)
            </button>
            <button
              onClick={() => {
                act({ type: "pantry", name: menuFor.name, inPantry: true });
                setMenuFor(null);
              }}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-left"
            >
              <Infinity className="mr-2 inline size-5 align-[-4px] text-brand-700" aria-hidden />
              Toujours au placard (ne plus jamais l&apos;afficher)
            </button>
            <button onClick={() => setMenuFor(null)} className="w-full py-2 text-stone-500">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
