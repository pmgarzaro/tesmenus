"use client";

import { useActionState, useEffect, useRef } from "react";
import { MEASURES, type MeasureKey } from "@/lib/body/measures";
import { saveGoalWeight, saveMeasures } from "./actions";

const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2";
const MAIN: MeasureKey[] = ["weightKg", "waistCm"];

function Field({ k, value }: { k: MeasureKey; value: number | null | undefined }) {
  const m = MEASURES.find((x) => x.key === k)!;
  return (
    <label className="text-xs text-stone-500">
      {m.short} ({m.unit})
      <input
        name={k}
        type="number"
        inputMode="decimal"
        step="0.1"
        min={m.min}
        max={m.max}
        defaultValue={value ?? ""}
        className={input}
      />
    </label>
  );
}

/** Today's reading: weight and waist first, the rest folded away. */
export function MeasureForm({ date, current }: { date: string; current: Partial<Record<MeasureKey, number | null>> }) {
  const [state, action, pending] = useActionState(saveMeasures, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && "ok" in state) ref.current?.querySelector("details")?.removeAttribute("open");
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3" key={date}>
      <label className="block text-xs text-stone-500">
        Date
        <input name="date" type="date" required defaultValue={date} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {MAIN.map((k) => (
          <Field key={k} k={k} value={current[k]} />
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-stone-600 underline">Autres mensurations</summary>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MEASURES.filter((m) => !MAIN.includes(m.key)).map((m) => (
            <Field key={m.key} k={m.key} value={current[m.key]} />
          ))}
        </div>
      </details>
      <p className="text-xs text-stone-500">
        Pèse-toi le matin à jeun, après être passé aux toilettes ; tour de taille au nombril, ventre relâché. Une case vide
        garde la valeur déjà notée ce jour-là.
      </p>
      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-stone-600">Relevé enregistré.</p>}
      <button disabled={pending} className="w-full btn-primary py-2.5 font-semibold text-white disabled:opacity-60">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}

export function GoalWeightForm({ goal }: { goal: number | null }) {
  const [state, action, pending] = useActionState(saveGoalWeight, null);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex-1 text-xs text-stone-500">
        Poids cible (kg, vide = aucun)
        <input name="goalWeightKg" type="number" inputMode="decimal" step="0.1" min="20" max="400" defaultValue={goal ?? ""} className={input} />
      </label>
      <button disabled={pending} className="rounded-xl border border-stone-300 px-4 py-2 disabled:opacity-60">
        Enregistrer
      </button>
      {state && "error" in state && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
