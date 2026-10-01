"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SLOTS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dateRange, isValidDate } from "@/lib/planning/dates";
import * as plans from "@/lib/planning/repo";

const newPlanSchema = z.object({
  startDate: z.string().refine(isValidDate, "Date invalide"),
  days: z.number().int().min(1, "Au moins 1 jour").max(14, "14 jours maximum"),
  slots: z.array(z.enum(SLOTS)).min(1, "Choisis au moins un créneau"),
  maxMinutesByDate: z.record(z.string(), z.number().int().min(5).max(600)),
  include: z.array(z.number().int()).max(14),
  onlyFreezable: z.boolean(),
  excludeTags: z.array(z.string().max(40)).max(20),
});

export type NewPlanPayload = z.infer<typeof newPlanSchema>;

export async function createPlanAction(payload: NewPlanPayload): Promise<string> {
  const { householdId } = await requireUser();
  const parsed = newPlanSchema.safeParse(payload);
  if (!parsed.success) return parsed.error.issues[0].message;
  const p = parsed.data;
  const dates = new Set(dateRange(p.startDate, p.days));
  const { id, warnings } = plans.createPlan(householdId, {
    startDate: p.startDate,
    days: p.days,
    slots: p.slots,
    constraints: {
      maxMinutesByDate: Object.fromEntries(Object.entries(p.maxMinutesByDate).filter(([d]) => dates.has(d))),
      include: p.include,
      onlyFreezable: p.onlyFreezable,
      excludeTags: p.excludeTags,
    },
  });
  revalidatePath("/planning");
  const qs = warnings.length ? `?w=${encodeURIComponent(JSON.stringify(warnings))}` : "";
  redirect(`/planning/${id}${qs}`);
}

export type CellAction =
  | { type: "recipe"; recipeId: number }
  | { type: "empty" }
  | { type: "out" }
  | { type: "leftover"; sourceId: number }
  | { type: "servings"; servings: number }
  | { type: "reroll" }
  | { type: "swap"; otherId: number };

const ERRORS: Record<CellAction["type"], string> = {
  recipe: "Recette introuvable.",
  empty: "Modification impossible.",
  out: "Modification impossible.",
  leftover: "Ces restes ne peuvent venir que d'un repas cuisiné avant.",
  servings: "Nombre de portions invalide.",
  reroll: "Aucune autre recette ne convient.",
  swap: "Les repas « restes » ne s'échangent pas.",
};

export async function editCell(planId: number, entryId: number, action: CellAction): Promise<string | null> {
  const { householdId: h } = await requireUser();
  const ok = (() => {
    switch (action.type) {
      case "recipe": return plans.setEntryRecipe(h, entryId, action.recipeId);
      case "empty": return plans.setEntryRecipe(h, entryId, null);
      case "out": return plans.setEatingOut(h, entryId);
      case "leftover": return plans.setLeftover(h, entryId, action.sourceId);
      case "servings": return plans.setServings(h, entryId, action.servings);
      case "reroll": return plans.rerollEntry(h, entryId);
      case "swap": return plans.swapEntries(h, entryId, action.otherId);
    }
  })();
  revalidatePath(`/planning/${planId}`);
  return ok ? null : ERRORS[action.type];
}

export async function regeneratePlanAction(planId: number): Promise<void> {
  const { householdId } = await requireUser();
  const warnings = plans.regeneratePlan(householdId, planId) ?? [];
  revalidatePath(`/planning/${planId}`);
  redirect(`/planning/${planId}${warnings.length ? `?w=${encodeURIComponent(JSON.stringify(warnings))}` : ""}`);
}

export async function deletePlanAction(planId: number): Promise<void> {
  const { householdId } = await requireUser();
  plans.deletePlan(householdId, planId);
  revalidatePath("/planning");
  redirect("/planning/historique");
}
