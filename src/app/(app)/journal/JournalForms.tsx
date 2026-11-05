"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LOG_SLOT_LABELS, type LogSlot } from "@/lib/journal/input";
import { addEntry, editEntry, saveTargets } from "./actions";

const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2";
const SLOTS = Object.keys(LOG_SLOT_LABELS) as LogSlot[];
const SHORT: Record<LogSlot, string> = {
  breakfast: "Petit-déj",
  lunch: "Déjeuner",
  snack: "Collation",
  dinner: "Dîner",
  dessert: "Dessert",
};

export type PlanSuggestion = {
  slot: LogSlot;
  recipeId: number;
  name: string;
  kcal: number | null;
  protein: number | null;
};

function SlotPicker({ value, onChange }: { value: LogSlot; onChange: (s: LogSlot) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Créneau">
      {SLOTS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`rounded-full px-3 py-1.5 text-sm ${value === s ? "bg-ink font-semibold text-white" : "bg-door"}`}
        >
          {SHORT[s]}
        </button>
      ))}
    </div>
  );
}

/** Quick add: slot + free text (+ optional estimates), or one tap on a planned meal to pre-fill. */
export function QuickAdd({
  date,
  defaultSlot,
  suggestions,
}: {
  date: string;
  defaultSlot: LogSlot;
  suggestions: PlanSuggestion[];
}) {
  const [state, action, pending] = useActionState(addEntry, null);
  const [slot, setSlot] = useState<LogSlot>(defaultSlot);
  const [recipe, setRecipe] = useState<PlanSuggestion | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state && "ok" in state) {
      formRef.current?.reset();
      setRecipe(null);
    }
  }, [state]);

  const prefill = (s: PlanSuggestion) => {
    setRecipe(s);
    setSlot(s.slot);
    const f = formRef.current!;
    (f.elements.namedItem("description") as HTMLInputElement).value = s.name;
    (f.elements.namedItem("servings") as HTMLInputElement).value = "1";
    (f.elements.namedItem("estKcal") as HTMLInputElement).value = s.kcal === null ? "" : String(s.kcal);
    (f.elements.namedItem("estProteinG") as HTMLInputElement).value = s.protein === null ? "" : String(s.protein);
    descRef.current?.focus();
  };

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="slot" value={slot} />
      <input type="hidden" name="recipeId" value={recipe?.recipeId ?? ""} />
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-stone-500">Depuis le planning :</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={`${s.slot}-${s.recipeId}`}
                type="button"
                onClick={() => prefill(s)}
                className={`rounded-full border px-3 py-1.5 text-left text-sm ${
                  recipe?.recipeId === s.recipeId && recipe.slot === s.slot ? "border-ink bg-ink text-white" : "border-stone-300"
                }`}
              >
                {SHORT[s.slot]} · {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <SlotPicker value={slot} onChange={setSlot} />
      <input
        ref={descRef}
        name="description"
        required
        maxLength={500}
        placeholder="Ex. 1 egg muffin + café au lait"
        className={input}
      />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-stone-500">
          Portions
          <input name="servings" type="number" inputMode="decimal" step="0.25" min="0.25" max="50" className={input} />
        </label>
        <label className="text-xs text-stone-500">
          kcal
          <input name="estKcal" type="number" inputMode="numeric" min="0" max="10000" className={input} />
        </label>
        <label className="text-xs text-stone-500">
          Protéines (g)
          <input name="estProteinG" type="number" inputMode="decimal" step="0.1" min="0" max="1000" className={input} />
        </label>
      </div>
      {recipe && (
        <p className="text-xs text-stone-500">
          Recette du planning liée{recipe.kcal !== null ? " ; valeurs estimées par l'appli pour 1 portion, modifiables" : ""}.{" "}
          <button type="button" className="underline" onClick={() => setRecipe(null)}>
            Délier
          </button>
        </p>
      )}
      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full btn-primary py-2.5 font-semibold text-white disabled:opacity-60">
        {pending ? "Ajout…" : "Ajouter"}
      </button>
    </form>
  );
}

export function EditEntry({
  entry,
}: {
  entry: { id: number; slot: LogSlot; description: string; servings: number | null; estKcal: number | null; estProteinG: number | null };
}) {
  const [state, action, pending] = useActionState(editEntry, null);
  const [slot, setSlot] = useState<LogSlot>(entry.slot);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (state && "ok" in state && detailsRef.current) detailsRef.current.open = false;
  }, [state]);
  return (
    <details ref={detailsRef} className="text-sm">
      <summary className="cursor-pointer text-stone-500 underline">Modifier</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="slot" value={slot} />
        <SlotPicker value={slot} onChange={setSlot} />
        <input name="description" required maxLength={500} defaultValue={entry.description} className={input} />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-stone-500">
            Portions
            <input name="servings" type="number" step="0.25" min="0.25" max="50" defaultValue={entry.servings ?? ""} className={input} />
          </label>
          <label className="text-xs text-stone-500">
            kcal
            <input name="estKcal" type="number" min="0" max="10000" defaultValue={entry.estKcal ?? ""} className={input} />
          </label>
          <label className="text-xs text-stone-500">
            Protéines (g)
            <input name="estProteinG" type="number" step="0.1" min="0" max="1000" defaultValue={entry.estProteinG ?? ""} className={input} />
          </label>
        </div>
        {state && "error" in state && <p className="text-red-600">{state.error}</p>}
        <button disabled={pending} className="rounded-xl border border-stone-300 px-4 py-1.5 disabled:opacity-60">
          Enregistrer
        </button>
      </form>
    </details>
  );
}

export function TargetsForm({ kcal, protein, notes }: { kcal: number; protein: number; notes: string | null }) {
  const [state, action, pending] = useActionState(saveTargets, null);
  return (
    <form action={action} className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-stone-500">
          kcal par jour
          <input name="kcalPerDay" type="number" required min="800" max="10000" defaultValue={kcal} className={input} />
        </label>
        <label className="text-xs text-stone-500">
          Protéines (g / jour)
          <input name="proteinG" type="number" required min="0" max="1000" defaultValue={protein} className={input} />
        </label>
      </div>
      <input name="notes" maxLength={1000} defaultValue={notes ?? ""} placeholder="Notes (ex. calculé sur 85 kg, sédentaire)" className={input} />
      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-stone-600">Objectifs enregistrés.</p>}
      <button disabled={pending} className="rounded-xl border border-stone-300 px-4 py-2 disabled:opacity-60">
        Enregistrer
      </button>
    </form>
  );
}
