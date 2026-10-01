"use client";

import { Camera, ClipboardPaste, Link2, PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const SOURCES = [
  { label: "Depuis une photo", hint: "Livre, fiche papier (une ou plusieurs pages)", href: "/recettes/importer/photo", Icon: Camera },
  { label: "Depuis un lien", hint: "Marmiton, 750g, blogs…", href: "/recettes/importer/url", Icon: Link2 },
  { label: "Coller un texte", hint: "Légende Instagram, e-mail…", href: "/recettes/importer/texte", Icon: ClipboardPaste },
  { label: "Saisie manuelle", hint: "Remplir le formulaire", href: "/recettes/nouvelle", Icon: PenLine },
];

/** Floating "+" button opening the list of ways to add a recipe. */
export function AddRecipeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ajouter une recette"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center btn-primary text-3xl sm:right-[max(1rem,calc(50vw-24rem+1rem))]"
      >
        <Plus className="size-7" strokeWidth={2.5} aria-hidden />
      </button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Ajouter une recette"
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl"
          >
            <h2 className="mb-3 text-lg font-semibold">Ajouter une recette</h2>
            <ul className="space-y-2">
              {SOURCES.map((s) => {
                const content = (
                  <>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                      <s.Icon className="size-5" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-medium">{s.label}</span>
                      <span className="block text-sm text-stone-500">{s.hint}</span>
                    </span>
                  </>
                );
                return (
                  <li key={s.label}>
                    {s.href ? (
                      <Link href={s.href} className="flex items-center gap-3 rounded-xl border border-stone-200 p-3 hover:bg-stone-50">
                        {content}
                      </Link>
                    ) : (
                      <div aria-disabled className="flex items-center gap-3 rounded-xl border border-stone-100 p-3 opacity-50">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <button onClick={() => setOpen(false)} className="mt-3 w-full py-2 text-stone-500">
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
