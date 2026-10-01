"use client";

import { useState } from "react";
import { formatIngredientLine, scaleQuantity, type Unit } from "@/lib/recipes/units";

type Ingredient = { quantity: number | null; unit: Unit | null; label: string; optional: boolean };

/** Ingredient list with a portions stepper that rescales quantities. */
export function ScaledIngredients({ servings, ingredients }: { servings: number; ingredients: Ingredient[] }) {
  const [target, setTarget] = useState(servings);
  const btn = "flex size-9 items-center justify-center rounded-full border border-stone-300 text-lg disabled:opacity-30";
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Ingrédients</h2>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => setTarget(target - 1)} disabled={target <= 1} aria-label="Moins de portions">−</button>
          <span className="min-w-24 text-center text-sm">
            <strong className="text-base">{target}</strong> portion{target > 1 ? "s" : ""}
          </span>
          <button className={btn} onClick={() => setTarget(target + 1)} disabled={target >= 50} aria-label="Plus de portions">+</button>
        </div>
      </div>
      {target !== servings && (
        <p className="mb-2 text-xs text-stone-500">
          Quantités recalculées (recette prévue pour {servings}).{" "}
          <button className="underline" onClick={() => setTarget(servings)}>Revenir</button>
        </p>
      )}
      {ingredients.length === 0 ? (
        <p className="text-sm text-stone-500">Aucun ingrédient.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {ingredients.map((i, idx) => (
            <li key={idx} className="py-2">
              {formatIngredientLine(scaleQuantity(i.quantity, servings, target), i.unit, i.label)}
              {i.optional && <span className="text-sm text-stone-400"> (facultatif)</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
