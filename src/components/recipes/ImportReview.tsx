"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ImportResult } from "@/lib/import/build";
import { Warnings } from "@/components/Warnings";
import { RecipeForm } from "./RecipeForm";

const METHOD_NOTE = {
  jsonld: { text: "Recette structurée trouvée sur la page : extraction fiable.", tone: "bg-green-50 text-green-800" },
  html: { text: "Extraction approximative à partir de la mise en page.", tone: "bg-amber-50 text-amber-800" },
  text: { text: "Texte analysé ligne par ligne.", tone: "bg-amber-50 text-amber-800" },
  photo: { text: "Texte lu sur la photo.", tone: "bg-amber-50 text-amber-800" },
  ai: { text: "Recette lue par l'IA (Gemini).", tone: "bg-violet-50 text-violet-800" },
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
        <p className="flex items-center gap-1.5 font-medium">
          {result.method === "ai" && <Sparkles className="size-4" aria-hidden />}
          {note.text}
        </p>
        <Warnings items={result.warnings} />
        {flagged && <p>Relis la recette : les champs encadrés en orange sont à vérifier.</p>}
        {duplicate && (
          <p>
            <TriangleAlert className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            Cette page est déjà dans ta bibliothèque :{" "}
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
        <details className="paper p-3 text-sm">
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
