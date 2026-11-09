"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { STOCK_LOCATIONS } from "@/db/schema";
import { addDays } from "@/lib/planning/dates";
import { LOCATION_LABELS, type StockLocation } from "@/lib/stock/stock";
import { addItem, updateItem } from "./actions";

const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2";

const QUICK_DATES = [
  { label: "+3 j", days: 3 },
  { label: "+1 sem.", days: 7 },
  { label: "+1 mois", days: 30 },
  { label: "+6 mois", days: 182 },
];

function LocationPicker({ value, onChange }: { value: StockLocation; onChange: (l: StockLocation) => void }) {
  return (
    <fieldset className="flex gap-1.5">
      <legend className="sr-only">Emplacement</legend>
      {STOCK_LOCATIONS.map((l) => (
        <label
          key={l}
          className={`flex-1 cursor-pointer rounded-full border px-2 py-1.5 text-center text-sm ${
            value === l ? "border-ink bg-ink font-semibold text-white" : "border-stone-300 bg-white"
          }`}
        >
          <input type="radio" name="location" value={l} checked={value === l} onChange={() => onChange(l)} className="sr-only" />
          {LOCATION_LABELS[l]}
        </label>
      ))}
    </fieldset>
  );
}

function DateField({ value, onChange, today }: { value: string; onChange: (d: string) => void; today: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-stone-500">
        À consommer avant (vide = pas de date)
        <input name="expiresOn" type="date" value={value} onChange={(e) => onChange(e.target.value)} className={input} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_DATES.map((q) => (
          <button
            key={q.days}
            type="button"
            onClick={() => onChange(addDays(today, q.days))}
            className="rounded-full border border-stone-300 bg-white px-2.5 py-0.5 text-sm"
          >
            {q.label}
          </button>
        ))}
        {value && (
          <button type="button" onClick={() => onChange("")} className="px-1 text-sm text-stone-500 underline">
            Sans date
          </button>
        )}
      </div>
    </div>
  );
}

/** Fold-away panel: open state kept on the client, so adding the first item does not close it. */
export function AddPanel({ initialOpen, children }: { initialOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details className="paper mb-4 p-4" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-display text-lg font-semibold">+ Ajouter</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** Quick entry: the location and the form stay, so several items go in one after the other. */
export function AddStockForm({ today, location: initial }: { today: string; location: StockLocation }) {
  const [state, action, pending] = useActionState(addItem, null);
  const [location, setLocation] = useState<StockLocation>(initial);
  const [date, setDate] = useState("");
  const name = useRef<HTMLInputElement>(null);
  const qty = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state && "ok" in state) {
      if (name.current) name.current.value = "";
      if (qty.current) qty.current.value = "";
      setDate("");
      name.current?.focus();
    }
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <LocationPicker value={location} onChange={setLocation} />
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="text-xs text-stone-500">
          Quoi
          <input ref={name} name="name" required maxLength={100} placeholder="Yaourts nature" className={input} />
        </label>
        <label className="text-xs text-stone-500">
          Quantité
          <input ref={qty} name="quantity" maxLength={50} placeholder="4, 500 g…" className={input} />
        </label>
      </div>
      <DateField value={date} onChange={setDate} today={today} />
      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-stone-600">Ajouté.</p>}
      <button disabled={pending} className="w-full btn-primary py-2.5 font-semibold text-white disabled:opacity-60">
        {pending ? "Ajout…" : "Ajouter au stock"}
      </button>
    </form>
  );
}

export function EditStockForm({
  today,
  item,
}: {
  today: string;
  item: { id: number; name: string; quantity: string | null; location: StockLocation; expiresOn: string | null; note: string | null };
}) {
  const [state, action, pending] = useActionState(updateItem, null);
  const [location, setLocation] = useState<StockLocation>(item.location);
  const [date, setDate] = useState(item.expiresOn ?? "");
  return (
    <form action={action} className="mt-2 space-y-3 rounded-xl bg-stone-50 p-3">
      <input type="hidden" name="id" value={item.id} />
      <LocationPicker value={location} onChange={setLocation} />
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="text-xs text-stone-500">
          Quoi
          <input name="name" required maxLength={100} defaultValue={item.name} className={input} />
        </label>
        <label className="text-xs text-stone-500">
          Quantité
          <input name="quantity" maxLength={50} defaultValue={item.quantity ?? ""} className={input} />
        </label>
      </div>
      <DateField value={date} onChange={setDate} today={today} />
      <label className="block text-xs text-stone-500">
        Note
        <input name="note" maxLength={200} defaultValue={item.note ?? ""} placeholder="Entamé, reste de chili…" className={input} />
      </label>
      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-stone-600">Enregistré.</p>}
      <button disabled={pending} className="rounded-xl border border-stone-300 bg-white px-4 py-2 disabled:opacity-60">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
