"use client";

import { BookmarkPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { saveTemplateAction } from "@/app/(app)/planning/actions";

/** "Sauvegarder comme modèle": names the plan and keeps it for later weeks. */
export function SaveTemplateButton({ planId, defaultName }: { planId: number; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <>
        <button type="button" onClick={() => (setOpen(true), setMessage(null))} className="text-brand-700 underline">
          <BookmarkPlus className="mr-1 inline size-4 align-[-2px]" aria-hidden />
          Sauvegarder comme modèle
        </button>
        {message && <span className="w-full text-xs text-emerald-700" role="status">{message}</span>}
      </>
    );
  }
  return (
    <form
      className="flex w-full items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveTemplateAction(planId, name);
          setMessage(res);
          if (res.startsWith("Modèle")) setOpen(false);
        });
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus
        aria-label="Nom du modèle"
        className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5"
      />
      <button disabled={pending} className="btn-primary shrink-0 px-3 py-1.5 text-sm">
        {pending ? "…" : "Sauver"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-stone-500">
        Annuler
      </button>
      {message && !message.startsWith("Modèle") && <span className="text-xs text-red-700" role="alert">{message}</span>}
    </form>
  );
}
