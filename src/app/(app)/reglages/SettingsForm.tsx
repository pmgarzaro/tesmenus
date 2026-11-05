"use client";

import { useActionState } from "react";
import { SLOTS } from "@/db/schema";
import { SLOT_LABELS } from "@/lib/labels";
import type { Settings } from "@/lib/settings";
import { updateSettings } from "./actions";

const field = "w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 text-right";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [message, action, pending] = useActionState(updateSettings, null);
  return (
    <form action={action} className="space-y-4 paper p-4">
      <label className="flex items-center justify-between gap-4">
        <span>Nombre de jours par planning</span>
        <input type="number" name="defaultDays" min={1} max={14} defaultValue={settings.defaultDays} className={field} />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>Personnes dans le foyer</span>
        <input type="number" name="people" min={1} max={12} defaultValue={settings.people} className={field} />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>Portions cuisinées par recette</span>
        <input type="number" name="servingsPerRecipe" min={1} max={24} defaultValue={settings.servingsPerRecipe} className={field} />
      </label>
      <fieldset className="flex items-center justify-between gap-4">
        <legend className="float-left">Créneaux actifs</legend>
        <div className="flex gap-4">
          {SLOTS.map((slot) => (
            <label key={slot} className="flex items-center gap-1.5">
              <input type="checkbox" name="activeSlots" value={slot} defaultChecked={settings.activeSlots.includes(slot)} className="size-5 accent-brand-600" />
              {SLOT_LABELS[slot]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center justify-between gap-4">
        <span>Le repas du soir couvre le midi suivant (restes)</span>
        <input type="checkbox" name="dinnerCoversNextLunch" defaultChecked={settings.dinnerCoversNextLunch} className="size-5 accent-brand-600" />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>
          Un petit-déjeuner préparé couvre
          <span className="block text-xs text-stone-500">jours (1 = préparé chaque jour, 3 = egg muffins pour 3 matins…)</span>
        </span>
        <input type="number" name="breakfastDays" min={1} max={7} defaultValue={settings.breakfastDays} className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary px-5 py-2.5 font-semibold text-white disabled:opacity-60">
          Enregistrer
        </button>
        {message && <span className="text-sm text-stone-600">{message}</span>}
      </div>
    </form>
  );
}
