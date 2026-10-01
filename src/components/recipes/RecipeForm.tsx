"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AISLES, MEAL_TYPES, STEP_TYPES } from "@/db/schema";
import { saveRecipe } from "@/app/(app)/recettes/actions";
import { AISLE_LABELS, EQUIPMENT_SUGGESTIONS, MEAL_TYPE_LABELS, STEP_TYPE_LABELS } from "@/lib/labels";
import type { FieldFlags } from "@/lib/import/build";
import type { RecipeInput } from "@/lib/recipes/input";
import { guessAisle, normalizeTags, parseIngredientLine, parseQuantity } from "@/lib/recipes/normalize";
import { guessStep, splitSteps } from "@/lib/recipes/steps";
import { UNIT_OPTIONS, type Unit } from "@/lib/recipes/units";

type Aisle = (typeof AISLES)[number];
type StepType = (typeof STEP_TYPES)[number];

type IngRow = {
  key: number;
  quantity: string;
  unit: Unit | "";
  label: string;
  aisle: Aisle | "";
  optional: boolean;
};
type StepRow = {
  key: number;
  text: string;
  durationMinutes: string;
  type: StepType;
  equipment: string;
  temperature: string;
  /** Meta fields still follow the text until the user edits them. */
  auto: boolean;
};

let nextKey = 1;
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const qtyStr = (n: number | null) => (n === null ? "" : String(Math.round(n * 1000) / 1000).replace(".", ","));

const toIngRow = (i: RecipeInput["ingredients"][number]): IngRow => ({
  key: nextKey++,
  quantity: qtyStr(i.quantity),
  unit: i.unit ?? "",
  label: i.label,
  aisle: i.aisle ?? "",
  optional: i.optional,
});
const toStepRow = (s: RecipeInput["steps"][number], auto = false): StepRow => ({
  key: nextKey++,
  text: s.text,
  durationMinutes: str(s.durationMinutes),
  type: s.type,
  equipment: s.equipment ?? "",
  temperature: str(s.temperature),
  auto,
});
const emptyIng = (): IngRow => ({ key: nextKey++, quantity: "", unit: "", label: "", aisle: "", optional: false });
const emptyStep = (): StepRow =>
  toStepRow({ text: "", durationMinutes: null, type: "preparation", equipment: null, temperature: null }, true);

function intOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-brand-500";
const small =
  "rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500";
const iconBtn = "rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30";

function move<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

// Highlight for imported values to double-check (cleared once edited).
const flagRing = "ring-2 ring-amber-400";

export function RecipeForm({
  recipeId,
  initial,
  allTags,
  flags,
  sourceType = "manuel",
  cancelHref,
  imagePaths,
}: {
  recipeId: number | null;
  initial: RecipeInput;
  allTags: string[];
  /** Imported draft: fields to check on the review screen. */
  flags?: FieldFlags;
  sourceType?: "manuel" | "url" | "photo";
  cancelHref?: string;
  /** Photos from the photo import, attached on creation. */
  imagePaths?: string[];
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [servings, setServings] = useState(str(initial.servings));
  const [prep, setPrep] = useState(str(initial.prepMinutes));
  const [cook, setCook] = useState(str(initial.cookMinutes));
  const [mealType, setMealType] = useState(initial.mealType);
  const [tags, setTags] = useState(initial.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [fridgeDays, setFridgeDays] = useState(str(initial.fridgeDays));
  const [freezable, setFreezable] = useState(initial.freezable);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [ings, setIngs] = useState<IngRow[]>(
    initial.ingredients.length ? initial.ingredients.map(toIngRow) : [emptyIng()],
  );
  const [steps, setSteps] = useState<StepRow[]>(
    initial.steps.length ? initial.steps.map((s) => toStepRow(s)) : [emptyStep()],
  );
  const initialStepKeys = steps.map((s) => s.key);
  // Flagged fields and ingredient rows (by key); a field leaves the set once edited.
  const [flagged, setFlagged] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (!flags) return set;
    for (const [field, flag] of Object.entries(flags)) if (typeof flag === "string") set.add(field);
    for (const i of Object.keys(flags.ingredients ?? {})) set.add(`ing-${ings[Number(i)]?.key}`);
    for (const i of Object.keys(flags.steps ?? {})) set.add(`step-${initialStepKeys[Number(i)]}`);
    return set;
  });
  const isFlagged = (field: string) => flagged.has(field);
  const reviewed = (field: string) =>
    flagged.has(field) &&
    setFlagged((f) => {
      const next = new Set(f);
      next.delete(field);
      return next;
    });
  const ring = (field: string) => (isFlagged(field) ? flagRing : "");
  const [pasteIngs, setPasteIngs] = useState<string | null>(null);
  const [pasteSteps, setPasteSteps] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updIng = (key: number, patch: Partial<IngRow>) => {
    reviewed(`ing-${key}`);
    setIngs((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const updStep = (key: number, patch: Partial<StepRow>) => {
    if ("text" in patch) reviewed(`step-${key}`);
    setSteps((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addTags = (raw: string) => {
    setTags((t) => normalizeTags([...t, ...raw.split(",")]));
    setTagDraft("");
  };

  const fillStepFromText = (row: StepRow) => {
    if (!row.auto || !row.text.trim()) return;
    const g = guessStep(row.text);
    updStep(row.key, {
      type: g.type,
      durationMinutes: str(g.durationMinutes),
      equipment: g.equipment ?? "",
      temperature: str(g.temperature),
    });
  };

  function buildPayload(): RecipeInput | string {
    const ingredients: RecipeInput["ingredients"] = [];
    for (const [i, r] of ings.entries()) {
      if (!r.label.trim() && !r.quantity.trim()) continue;
      const quantity = r.quantity.trim() ? parseQuantity(r.quantity) : null;
      if (r.quantity.trim() && quantity === null) return `Quantité invalide (ingrédient ${i + 1})`;
      if (!r.label.trim()) return `Ingrédient ${i + 1} sans nom`;
      ingredients.push({
        quantity,
        unit: quantity === null ? null : r.unit || "piece",
        label: r.label.trim(),
        aisle: r.aisle || null,
        optional: r.optional,
      });
    }
    const stepsOut: RecipeInput["steps"] = [];
    for (const [i, s] of steps.entries()) {
      if (!s.text.trim()) continue;
      const durationMinutes = intOrNull(s.durationMinutes);
      const temperature = intOrNull(s.temperature);
      if (Number.isNaN(durationMinutes)) return `Durée invalide (étape ${i + 1})`;
      if (Number.isNaN(temperature)) return `Température invalide (étape ${i + 1})`;
      stepsOut.push({
        text: s.text.trim(),
        durationMinutes,
        type: s.type,
        equipment: s.equipment.trim() || null,
        temperature: s.equipment.trim() === "four" ? temperature : null,
      });
    }
    const nums = { servings: intOrNull(servings), prep: intOrNull(prep), cook: intOrNull(cook), fridge: intOrNull(fridgeDays) };
    if (nums.servings === null || Number.isNaN(nums.servings)) return "Nombre de portions invalide";
    if ([nums.prep, nums.cook, nums.fridge].some(Number.isNaN)) return "Durée invalide";
    return {
      title: title.trim(),
      description: description.trim() || null,
      servings: nums.servings,
      prepMinutes: nums.prep,
      cookMinutes: nums.cook,
      mealType,
      tags: normalizeTags([...tags, ...tagDraft.split(",")]),
      sourceUrl: sourceUrl.trim() || null,
      notes: notes.trim() || null,
      fridgeDays: nums.fridge,
      freezable,
      ingredients,
      steps: stepsOut,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload();
    if (typeof payload === "string") return setError(payload);
    setError(null);
    startTransition(async () => {
      const err = await saveRecipe(recipeId, payload, sourceType, imagePaths);
      if (err) setError(err);
    });
  }

  const suggestions = allTags.filter((t) => !tags.includes(t)).slice(0, 12);

  return (
    <form onSubmit={submit} className="space-y-6 pb-20">
      <section className="space-y-3 paper p-4">
        <input
          value={title}
          onChange={(e) => {
            reviewed("title");
            setTitle(e.target.value);
          }}
          required
          placeholder="Titre de la recette"
          className={`${input} text-lg font-semibold ${ring("title")}`}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (facultatif)"
          rows={2}
          className={input}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm text-stone-600">
            Portions
            <input value={servings} onChange={(e) => { reviewed("servings"); setServings(e.target.value); }} inputMode="numeric" required className={`${input} ${ring("servings")}`} />
          </label>
          <label className="text-sm text-stone-600">
            Préparation (min)
            <input value={prep} onChange={(e) => { reviewed("prepMinutes"); setPrep(e.target.value); }} inputMode="numeric" className={`${input} ${ring("prepMinutes")}`} />
          </label>
          <label className="text-sm text-stone-600">
            Cuisson (min)
            <input value={cook} onChange={(e) => { reviewed("cookMinutes"); setCook(e.target.value); }} inputMode="numeric" className={`${input} ${ring("cookMinutes")}`} />
          </label>
          <label className="text-sm text-stone-600">
            Type
            <select value={mealType} onChange={(e) => { reviewed("mealType"); setMealType(e.target.value as typeof mealType); }} className={`${input} ${ring("mealType")}`}>
              {MEAL_TYPES.map((t) => (
                <option key={t} value={t}>{MEAL_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-sm text-stone-600">
            Tags{isFlagged("tags") && <span className="ml-2 text-xs text-amber-700">proposés, à vérifier</span>}
          </span>
          <div className="flex flex-wrap gap-1.5" onClick={() => reviewed("tags")}>
            {tags.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTags(tags.filter((x) => x !== t))}
                className="rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-700"
                aria-label={`Retirer ${t}`}
              >
                {t} ✕
              </button>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => (e.target.value.endsWith(",") ? addTags(e.target.value) : setTagDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTags(tagDraft);
                }
              }}
              onBlur={() => tagDraft.trim() && addTags(tagDraft)}
              placeholder="ajouter (végé, rapide…)"
              className={`${small} min-w-40 flex-1`}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTags(normalizeTags([...tags, t]))}
                  className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs text-stone-600"
                >
                  + {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            Se garde
            <input value={fridgeDays} onChange={(e) => { reviewed("fridgeDays"); setFridgeDays(e.target.value); }} inputMode="numeric" className={`${small} w-14 text-right ${ring("fridgeDays")}`} />
            jours au frigo
          </label>
          <label className={`flex items-center gap-2 rounded-lg px-1 text-sm text-stone-600 ${ring("freezable")}`}>
            <input type="checkbox" checked={freezable} onChange={(e) => { reviewed("freezable"); setFreezable(e.target.checked); }} className="size-5 accent-brand-600" />
            Congelable
          </label>
        </div>
      </section>

      <section className="space-y-3 paper p-4">
        <h2 className="font-semibold">Ingrédients</h2>
        <ul className="space-y-3">
          {ings.map((r, i) => (
            <li
              key={r.key}
              className={`space-y-1.5 border-b border-stone-100 pb-3 last:border-0 ${isFlagged(`ing-${r.key}`) ? "-mx-2 rounded-lg bg-amber-50 px-2 pt-2" : ""}`}
            >
              {isFlagged(`ing-${r.key}`) && <p className="text-xs text-amber-700">Lecture incertaine : à vérifier</p>}
              <div className="flex gap-2">
                <input
                  value={r.quantity}
                  onChange={(e) => updIng(r.key, { quantity: e.target.value })}
                  inputMode="decimal"
                  placeholder="Qté"
                  aria-label="Quantité"
                  className={`${small} w-16 text-right`}
                />
                <select
                  value={r.unit}
                  onChange={(e) => updIng(r.key, { unit: e.target.value as Unit | "" })}
                  aria-label="Unité"
                  className={`${small} w-24`}
                >
                  <option value="">—</option>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
                <input
                  value={r.label}
                  onChange={(e) => updIng(r.key, { label: e.target.value })}
                  placeholder="ingrédient"
                  aria-label="Ingrédient"
                  className={`${small} min-w-0 flex-1`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                <select
                  value={r.aisle}
                  onChange={(e) => updIng(r.key, { aisle: e.target.value as Aisle | "" })}
                  aria-label="Rayon"
                  className="max-w-[60%] rounded border border-stone-200 bg-white px-1 py-0.5"
                >
                  <option value="">
                    Rayon auto{r.label.trim() ? ` (${AISLE_LABELS[guessAisle(r.label)]})` : ""}
                  </option>
                  {AISLES.map((a) => (
                    <option key={a} value={a}>{AISLE_LABELS[a]}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={r.optional} onChange={(e) => updIng(r.key, { optional: e.target.checked })} />
                  facultatif
                </label>
                <span className="ml-auto flex">
                  <button type="button" className={iconBtn} disabled={i === 0} onClick={() => setIngs(move(ings, i, -1))} aria-label="Monter">↑</button>
                  <button type="button" className={iconBtn} disabled={i === ings.length - 1} onClick={() => setIngs(move(ings, i, 1))} aria-label="Descendre">↓</button>
                  <button type="button" className={iconBtn} onClick={() => setIngs(ings.filter((x) => x.key !== r.key))} aria-label="Supprimer l'ingrédient">✕</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
        {pasteIngs !== null ? (
          <div className="space-y-2">
            <textarea
              value={pasteIngs}
              onChange={(e) => setPasteIngs(e.target.value)}
              rows={5}
              autoFocus
              placeholder={"Un ingrédient par ligne :\n200 g de farine\n2 oignons\n1 c. à s. d'huile d'olive"}
              className={input}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-white"
                onClick={() => {
                  const parsed = pasteIngs.split("\n").map((l) => l.trim()).filter(Boolean).map(parseIngredientLine);
                  const rows = parsed.map((p) => toIngRow({ ...p, aisle: null }));
                  setIngs([...ings.filter((r) => r.label.trim() || r.quantity.trim()), ...rows]);
                  setPasteIngs(null);
                }}
              >
                Ajouter ces ingrédients
              </button>
              <button type="button" className="px-3 py-1.5 text-sm text-stone-500" onClick={() => setPasteIngs(null)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 text-sm">
            <button type="button" className="font-medium text-brand-700" onClick={() => setIngs([...ings, emptyIng()])}>
              + Ajouter un ingrédient
            </button>
            <button type="button" className="text-stone-600 underline" onClick={() => setPasteIngs("")}>
              Coller une liste
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3 paper p-4">
        <h2 className="font-semibold">Étapes</h2>
        <datalist id="equipment-list">
          {EQUIPMENT_SUGGESTIONS.map((e) => <option key={e} value={e} />)}
        </datalist>
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={s.key} className="space-y-1.5">
              <div className="flex gap-2">
                <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <textarea
                  value={s.text}
                  onChange={(e) => updStep(s.key, { text: e.target.value })}
                  onBlur={() => fillStepFromText(s)}
                  rows={2}
                  placeholder="Décrire l'étape…"
                  aria-label={`Étape ${i + 1}`}
                  className={`${input} min-w-0 flex-1 ${ring(`step-${s.key}`)}`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-8 text-xs text-stone-500">
                <select
                  value={s.type}
                  onChange={(e) => updStep(s.key, { type: e.target.value as StepType, auto: false })}
                  aria-label="Type d'étape"
                  className="rounded border border-stone-200 bg-white px-1 py-0.5"
                >
                  {STEP_TYPES.map((t) => <option key={t} value={t}>{STEP_TYPE_LABELS[t]}</option>)}
                </select>
                <input
                  value={s.durationMinutes}
                  onChange={(e) => updStep(s.key, { durationMinutes: e.target.value, auto: false })}
                  inputMode="numeric"
                  placeholder="durée"
                  aria-label="Durée (min)"
                  className="w-14 rounded border border-stone-200 px-1 py-0.5 text-right"
                />
                min
                <input
                  value={s.equipment}
                  onChange={(e) => updStep(s.key, { equipment: e.target.value, auto: false })}
                  list="equipment-list"
                  placeholder="équipement"
                  aria-label="Équipement"
                  className="w-28 rounded border border-stone-200 px-1 py-0.5"
                />
                {s.equipment.trim() === "four" && (
                  <>
                    <input
                      value={s.temperature}
                      onChange={(e) => updStep(s.key, { temperature: e.target.value, auto: false })}
                      inputMode="numeric"
                      placeholder="°C"
                      aria-label="Température (°C)"
                      className="w-14 rounded border border-stone-200 px-1 py-0.5 text-right"
                    />
                    °C
                  </>
                )}
                <span className="ml-auto flex">
                  <button type="button" className={iconBtn} disabled={i === 0} onClick={() => setSteps(move(steps, i, -1))} aria-label="Monter">↑</button>
                  <button type="button" className={iconBtn} disabled={i === steps.length - 1} onClick={() => setSteps(move(steps, i, 1))} aria-label="Descendre">↓</button>
                  <button type="button" className={iconBtn} onClick={() => setSteps(steps.filter((x) => x.key !== s.key))} aria-label="Supprimer l'étape">✕</button>
                </span>
              </div>
            </li>
          ))}
        </ol>
        {pasteSteps !== null ? (
          <div className="space-y-2">
            <textarea
              value={pasteSteps}
              onChange={(e) => setPasteSteps(e.target.value)}
              rows={6}
              autoFocus
              placeholder="Une étape par ligne. Durée, four et température sont détectés automatiquement."
              className={input}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-white"
                onClick={() => {
                  const rows = splitSteps(pasteSteps).map((text) => ({ ...toStepRow({ text, ...guessStep(text) }), auto: true }));
                  setSteps([...steps.filter((s) => s.text.trim()), ...rows]);
                  setPasteSteps(null);
                }}
              >
                Ajouter ces étapes
              </button>
              <button type="button" className="px-3 py-1.5 text-sm text-stone-500" onClick={() => setPasteSteps(null)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 text-sm">
            <button type="button" className="font-medium text-brand-700" onClick={() => setSteps([...steps, emptyStep()])}>
              + Ajouter une étape
            </button>
            <button type="button" className="text-stone-600 underline" onClick={() => setPasteSteps("")}>
              Coller les étapes
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3 paper p-4">
        <label className="block text-sm text-stone-600">
          Source (URL)
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} type="url" inputMode="url" placeholder="https://…" className={input} />
        </label>
        <label className="block text-sm text-stone-600">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Astuces, variantes…" className={input} />
        </label>
      </section>

      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-10 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          {error ? <p className="flex-1 text-sm text-red-600">{error}</p> : <span className="flex-1" />}
          <Link href={cancelHref ?? (recipeId ? `/recettes/${recipeId}` : "/recettes")} className="px-3 py-2 text-stone-600">
            Annuler
          </Link>
          <button disabled={pending} className="btn-primary px-5 py-2 font-semibold text-white disabled:opacity-60">
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </form>
  );
}
