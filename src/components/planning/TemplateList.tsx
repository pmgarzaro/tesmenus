"use client";

import { Bookmark, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { applyTemplateAction, deleteTemplateAction, renameTemplateAction } from "@/app/(app)/planning/actions";

type Template = { id: number; name: string; days: number; dishes: string[] };

/** Saved plans: pick a start date to reuse one. */
export function TemplateList({ templates, defaultStart }: { templates: Template[]; defaultStart: string }) {
  if (templates.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="templates-title">
      <h2 id="templates-title" className="font-display text-xl font-bold">Modèles enregistrés</h2>
      <ul className="space-y-2">
        {templates.map((t) => (
          <TemplateItem key={t.id} template={t} defaultStart={defaultStart} />
        ))}
      </ul>
    </section>
  );
}

function TemplateItem({ template: t, defaultStart }: { template: Template; defaultStart: string }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(t.name);
  const [start, setStart] = useState(defaultStart);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const shown = t.dishes.slice(0, 4).join(" · ") + (t.dishes.length > 4 ? ` +${t.dishes.length - 4}` : "");

  return (
    <li className="paper px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const err = await renameTemplateAction(t.id, name);
                setError(err);
                if (!err) setRenaming(false);
              });
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              aria-label="Nouveau nom"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1"
            />
            <button disabled={pending} className="text-sm font-medium text-brand-700">OK</button>
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
            <span className="flex items-center gap-1.5 font-semibold">
              <Bookmark className="size-4 shrink-0 text-brand-600" aria-hidden />
              <span className="truncate">{t.name}</span>
            </span>
            <span className="block text-xs text-stone-500">
              {t.days} jour{t.days > 1 ? "s" : ""}
              {shown && ` · ${shown}`}
            </span>
          </button>
        )}
        <div className="flex shrink-0 gap-3 pt-0.5 text-stone-400">
          <button type="button" aria-label={`Renommer ${t.name}`} onClick={() => setRenaming(!renaming)}>
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Supprimer ${t.name}`}
            disabled={pending}
            onClick={() => confirm(`Supprimer le modèle « ${t.name} » ?`) && run(() => deleteTemplateAction(t.id))}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {open && !renaming && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => setError(await applyTemplateAction(t.id, start)));
          }}
        >
          <label className="min-w-0 flex-1 text-sm text-stone-600">
            À partir du
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
            />
          </label>
          <button disabled={pending} className="btn-primary shrink-0 px-4 py-2.5 text-sm">
            {pending ? "…" : "Utiliser"}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
    </li>
  );
}
