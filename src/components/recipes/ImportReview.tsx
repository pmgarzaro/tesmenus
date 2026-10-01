"use client";

import Link from "next/link";
import type { ImportResult } from "@/lib/import/build";
import { RecipeForm } from "./RecipeForm";

const METHOD_NOTE = {
  jsonld: { text: "Recette structurée trouvée sur la page : extraction fiable.", tone: "bg-green-50 text-green-800" },
  html: { text: "Extraction approximative à partir de la mise en page.", tone: "bg-amber-50 text-amber-800" },
  text: { text: "Texte analysé ligne par ligne.", tone: "bg-amber-50 text-amber-800" },
  photo: { text: "Texte lu sur la photo.", tone: "bg-amber-50 text-amber-800" },
};

/** Review screen shared by every import: banner, photos / raw text, pre-filled form. */
export function ImportReview({
  result,
  duplicate,
  allTags,
  sourceType,
  imagePaths,
  ocrText,
  onRestart,
}: {
  result: ImportResult;
  duplicate?: { id: number; title: string } | null;
  allTags: string[];
  sourceType: "manuel" | "url" | "photo";
  imagePaths?: string[];
  ocrText?: string;
  onRestart: () => void;
}) {
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
        <button onClick={onRestart} className="underline">Recommencer</button>
      </div>

      {imagePaths && imagePaths.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {imagePaths.map((p, i) => (
            <a key={p} href={`/api/uploads/${p}`} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/uploads/${p}`} alt={`Page ${i + 1}`} className="h-28 rounded-lg border border-stone-200 object-cover" />
            </a>
          ))}
          <p className="self-center text-xs text-stone-500">Touche une photo pour l&apos;agrandir.</p>
        </div>
      )}
      {ocrText && (
        <details className="rounded-2xl bg-white p-3 text-sm shadow-sm">
          <summary className="cursor-pointer text-stone-600">Texte lu sur la photo (pour copier-coller)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-stone-700">{ocrText}</pre>
        </details>
      )}

      <RecipeForm
        recipeId={null}
        initial={result.draft}
        flags={result.flags}
        allTags={allTags}
        sourceType={sourceType}
        imagePaths={imagePaths}
        cancelHref="/recettes"
      />
    </div>
  );
}
