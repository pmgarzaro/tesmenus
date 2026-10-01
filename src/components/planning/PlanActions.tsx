"use client";

import { useTransition } from "react";
import { deletePlanAction, regeneratePlanAction } from "@/app/(app)/planning/actions";

export function PlanActions({ planId }: { planId: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      <button
        disabled={pending}
        onClick={() => confirm("Remplacer tous les repas par un nouveau tirage ?") && start(() => regeneratePlanAction(planId))}
        className="text-brand-700 underline disabled:opacity-50"
      >
        {pending ? "…" : "🎲 Tout relancer"}
      </button>
      <button
        disabled={pending}
        onClick={() => confirm("Supprimer ce planning ?") && start(() => deletePlanAction(planId))}
        className="text-red-600 underline disabled:opacity-50"
      >
        Supprimer
      </button>
    </div>
  );
}
