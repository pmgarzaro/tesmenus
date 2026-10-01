"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl">🫕</p>
      <h1 className="text-2xl font-bold">Oups, quelque chose a brûlé</h1>
      <p className="text-stone-600">Une erreur inattendue est survenue. Tes données ne sont pas perdues.</p>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">Réessayer</button>
        <Link href="/recettes" className="rounded-xl border border-stone-300 px-5 py-3">Accueil</Link>
      </div>
      {error.digest && <p className="text-xs text-stone-400">Code : {error.digest}</p>}
    </main>
  );
}
