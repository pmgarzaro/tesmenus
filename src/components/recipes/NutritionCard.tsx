"use client";

import { ChevronDown, Pencil, Sparkles } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { estimateNutritionAction, saveIngredientNutritionAction } from "@/app/(app)/recettes/actions";
import type { Macros, NutritionResult } from "@/lib/nutrition/compute";

type Props = {
  recipeId: number;
  servings: number;
  result: Pick<NutritionResult, "perServing" | "unknown" | "details" | "coverage">;
  split: { protein: number; carbs: number; fat: number };
  aiEnabled: boolean;
};

const MACROS: { key: keyof Omit<Macros, "kcal">; label: string; color: string }[] = [
  { key: "protein", label: "Protéines", color: "bg-sky-500" },
  { key: "carbs", label: "Glucides", color: "bg-amber-400" },
  { key: "fat", label: "Lipides", color: "bg-brand-500" },
];

const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

/** Calories and macros per serving, with what could not be counted and how to fix it. */
export function NutritionCard({ recipeId, servings, result, split, aiEnabled }: Props) {
  const { perServing, unknown, details } = result;
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<number | null>(null);
  const counted = details.length > 0;

  return (
    <section className="paper p-4" aria-labelledby="nutrition-title">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="nutrition-title" className="font-semibold">Apport nutritionnel</h2>
        <span className="text-xs text-stone-500">par portion · {servings} portion{servings > 1 ? "s" : ""}</span>
      </div>

      {counted ? (
        <>
          <p className="font-display text-4xl font-bold leading-none" data-testid="kcal">
            ≈ {Math.round(perServing.kcal)} <span className="text-xl">kcal</span>
          </p>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-stone-200" aria-hidden>
            {MACROS.map((m) => (
              <div key={m.key} className={m.color} style={{ width: `${split[m.key] * 100}%` }} />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {MACROS.map((m) => (
              <div key={m.key} className="rounded-xl bg-white/60 py-2">
                <dt className="flex items-center justify-center gap-1.5 text-xs text-stone-500">
                  <span className={`size-2 rounded-full ${m.color}`} aria-hidden />
                  {m.label}
                </dt>
                <dd className="font-semibold">{round(perServing[m.key])} g</dd>
                <dd className="text-[11px] text-stone-400">{Math.round(split[m.key] * 100)} %</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm text-stone-500">Pas assez d&apos;informations pour estimer les calories.</p>
      )}

      {unknown.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-amber-400 bg-amber-50/70 p-3 text-sm">
          <p className="font-medium">
            Non compté{unknown.length > 1 ? "s" : ""} dans le total :
          </p>
          <ul className="mt-1 space-y-1">
            {unknown.map((u, idx) => (
              <li key={`${u.ingredientId}-${idx}`}>
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {u.label}{" "}
                    <span className="text-xs text-stone-500">
                      ({u.reason === "aliment" ? "aliment inconnu" : "poids d'une pièce inconnu"})
                    </span>
                  </span>
                  {u.ingredientId !== undefined && (
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-brand-700 underline"
                      onClick={() => setEditing(editing === u.ingredientId ? null : u.ingredientId!)}
                    >
                      Renseigner
                    </button>
                  )}
                </div>
                {editing === u.ingredientId && (
                  <IngredientForm
                    recipeId={recipeId}
                    ingredientId={u.ingredientId}
                    name={u.name}
                    weightOnly={u.reason === "poids"}
                    onDone={() => setEditing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
          {aiEnabled && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => setAiMessage(await estimateNutritionAction(recipeId)))}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <Sparkles className="size-4" aria-hidden />
              {pending ? "L'IA estime…" : "Compléter avec l'IA"}
            </button>
          )}
          {aiMessage && <p className="mt-2 text-xs text-stone-600" role="status">{aiMessage}</p>}
        </div>
      )}

      {counted && (
        <details className="group mt-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-stone-500">
            <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden />
            Détail par ingrédient (recette entière)
          </summary>
          <ul className="mt-2 divide-y divide-dashed divide-black/10">
            {details.map((d, idx) => (
              <li key={`${d.ingredientId}-${idx}`} className="py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {d.label}{" "}
                    <span className="text-xs text-stone-400">
                      {Math.round(d.grams)} g{d.source === "ia" ? " · valeurs IA" : d.source === "manuel" ? " · vos valeurs" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    {Math.round(d.kcal)} kcal
                    {d.ingredientId !== undefined && (
                      <button
                        type="button"
                        aria-label={`Corriger ${d.label}`}
                        className="text-stone-400"
                        onClick={() => setEditing(editing === d.ingredientId ? null : d.ingredientId!)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </span>
                </div>
                {editing === d.ingredientId && (
                  <IngredientForm
                    recipeId={recipeId}
                    ingredientId={d.ingredientId}
                    name={d.name}
                    weightOnly={false}
                    onDone={() => setEditing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-3 text-[11px] leading-snug text-stone-400">
        Estimation à partir de valeurs moyennes (type CIQUAL) ; les ingrédients facultatifs et sans quantité ne sont pas comptés.
      </p>
    </section>
  );
}

function IngredientForm(props: { recipeId: number; ingredientId: number; name: string; weightOnly: boolean; onDone: () => void }) {
  const [error, action, pending] = useActionState(
    async (prev: string | null, form: FormData) => {
      const res = await saveIngredientNutritionAction(props.recipeId, props.ingredientId, prev, form);
      if (res === null) props.onDone();
      return res;
    },
    null,
  );
  const input = "w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5";
  const field = (name: string, label: string) => (
    <label className="text-xs text-stone-600">
      {label}
      <input name={name} inputMode="decimal" className={input} autoComplete="off" />
    </label>
  );
  return (
    <form action={action} className="mt-2 space-y-2 rounded-xl bg-white/80 p-3">
      <p className="text-xs text-stone-500">
        « {props.name} » — valeurs gardées pour toutes vos recettes.
      </p>
      {!props.weightOnly && (
        <>
          <p className="text-xs font-medium">Pour 100 g (voir l&apos;étiquette)</p>
          <div className="grid grid-cols-2 gap-2">
            {field("kcal", "Calories (kcal)")}
            {field("protein", "Protéines (g)")}
            {field("carbs", "Glucides (g)")}
            {field("fat", "Lipides (g)")}
          </div>
        </>
      )}
      {field("gramsPerUnit", props.weightOnly ? "Poids d'une pièce (g)" : "Poids d'une pièce (g, si compté à la pièce)")}
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className="btn-primary px-3 py-1.5 text-sm">
          {pending ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={props.onDone} className="px-3 py-1.5 text-sm text-stone-600">
          Annuler
        </button>
      </div>
    </form>
  );
}
