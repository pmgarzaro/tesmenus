"use client";

import { Dices } from "lucide-react";
import { useTransition } from "react";
import { deletePlanAction, fillEmptyAction, regeneratePlanAction } from "@/app/(app)/planning/actions";
import { SaveTemplateButton } from "./SaveTemplateButton";

export function PlanActions({ planId, emptyCount, templateName }: { planId: number; emptyCount: number; templateName: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {emptyCount > 0 && (
        <button
          disabled={pending}
          onClick={() => start(() => fillEmptyAction(planId))}
          className="font-medium text-brand-700 underline disabled:opacity-50"
        >
          <Dices className="mr-1 inline size-4 align-[-2px]" aria-hidden />
          Compléter les {emptyCount} repas vides au hasard
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => confirm("Remplacer tous les repas par un nouveau tirage ?") && start(() => regeneratePlanAction(planId))}
        className="text-brand-700 underline disabled:opacity-50"
      >
        {pending ? "…" : (
          <>
            <Dices className="mr-1 inline size-4 align-[-2px]" aria-hidden />
            Tout relancer
          </>
        )}
      </button>
      <SaveTemplateButton planId={planId} defaultName={templateName} />
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
