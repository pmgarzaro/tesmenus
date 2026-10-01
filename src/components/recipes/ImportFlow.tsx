"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { type ImportResponse, importText, importUrl } from "@/app/(app)/recettes/importer/actions";
import { RecipeForm } from "./RecipeForm";

type Mode = "url" | "text";

const METHOD_NOTE = {
  jsonld: { text: "Recette structurée trouvée sur la page : extraction fiable.", tone: "bg-green-50 text-green-800" },
  html: { text: "Extraction approximative à partir de la mise en page.", tone: "bg-amber-50 text-amber-800" },
  text: { text: "Texte analysé ligne par ligne.", tone: "bg-amber-50 text-amber-800" },
};

/** Step 1: URL or text → Step 2: review form (pre-filled, doubtful fields highlighted). */
export function ImportFlow({ mode, allTags, initialUrl }: { mode: Mode; allTags: string[]; initialUrl?: string }) {
  const [value, setValue] = useState(initialUrl ?? "");
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [pending, start] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const autoStarted = useRef(false);

  const run = (input: string) =>
    start(async () => {
      setResponse(null);
      setResponse(await (mode === "url" ? importUrl(input) : importText(input)));
    });

  // Shared links (?url=…) start right away.
  useEffect(() => {
    if (initialUrl && !autoStarted.current) {
      autoStarted.current = true;
      run(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  useEffect(() => {
    if (!pending) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  if (response?.ok) {
    const { result, duplicate } = response;
    const note = METHOD_NOTE[result.method];
    const flagged = Object.keys(result.flags).length > 0;
    return (
      <div className="space-y-3">
        <div className={`space-y-1 rounded-2xl p-3 text-sm ${note.tone}`}>
          <p className="font-medium">{note.text}</p>
          {result.warnings.map((w) => <p key={w}>⚠️ {w}</p>)}
          {flagged && <p>Relis la recette : les champs encadrés en orange sont à vérifier.</p>}
          {duplicate && (
            <p>
              ⚠️ Cette page est déjà dans ta bibliothèque :{" "}
              <Link href={`/recettes/${duplicate.id}`} className="underline">{duplicate.title}</Link>
            </p>
          )}
          <button onClick={() => setResponse(null)} className="underline">
            Recommencer
          </button>
        </div>
        <RecipeForm
          recipeId={null}
          initial={result.draft}
          flags={result.flags}
          allTags={allTags}
          sourceType={mode === "url" ? "url" : "manuel"}
          cancelHref="/recettes"
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) run(value);
      }}
      className="space-y-4 rounded-2xl bg-white p-4 shadow-sm"
    >
      {mode === "url" ? (
        <label className="block space-y-2">
          <span className="text-sm text-stone-600">Lien de la recette (Marmiton, 750g, Cuisine AZ, blog…)</span>
          <input
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://…"
            required
            autoFocus={!initialUrl}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-brand-500"
          />
        </label>
      ) : (
        <label className="block space-y-2">
          <span className="text-sm text-stone-600">
            Colle le texte de la recette (légende Instagram, e-mail, notes…). Les titres « Ingrédients » et « Préparation » aident.
          </span>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={12}
            required
            autoFocus
            placeholder={"Gâteau au yaourt\nPour 6 personnes\n\nIngrédients :\n1 pot de yaourt\n3 œufs\n…\n\nPréparation :\n1. Préchauffer le four à 180 °C.\n…"}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-brand-500"
          />
        </label>
      )}

      {response && !response.ok && (
        <div className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Extraction échouée : {response.error}</p>
          <p>
            Tu peux réessayer,{" "}
            {mode === "url" && (
              <>
                <Link href="/recettes/importer/texte" className="underline">coller le texte</Link> ou{" "}
              </>
            )}
            <Link href="/recettes/nouvelle" className="underline">saisir la recette à la main</Link>.
          </p>
        </div>
      )}

      <button
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-70"
      >
        {pending ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {mode === "url" ? "Récupération de la page" : "Analyse"}… {elapsed > 0 && `${elapsed} s`}
          </>
        ) : mode === "url" ? (
          "Importer"
        ) : (
          "Analyser le texte"
        )}
      </button>
    </form>
  );
}
