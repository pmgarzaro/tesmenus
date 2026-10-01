"use client";

import { useTransition } from "react";
import { removeRecipe } from "@/app/(app)/recettes/actions";

export function DeleteRecipeButton({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm(`Supprimer « ${title} » ? Cette action est définitive.`)) start(() => removeRecipe(id));
      }}
      className="text-sm text-red-600 underline disabled:opacity-50"
    >
      {pending ? "Suppression…" : "Supprimer la recette"}
    </button>
  );
}
