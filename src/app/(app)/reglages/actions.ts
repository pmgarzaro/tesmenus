"use server";

import { revalidatePath } from "next/cache";
import { saveSettings } from "@/lib/settings";

export async function updateSettings(_prev: string | null, form: FormData): Promise<string | null> {
  try {
    saveSettings({
      defaultDays: Number(form.get("defaultDays")),
      activeSlots: form.getAll("activeSlots").map(String) as ("midi" | "soir")[],
      people: Number(form.get("people")),
      servingsPerRecipe: Number(form.get("servingsPerRecipe")),
      dinnerCoversNextLunch: form.get("dinnerCoversNextLunch") === "on",
    });
  } catch {
    return "Valeurs invalides";
  }
  revalidatePath("/reglages");
  return "Réglages enregistrés";
}

export async function loadSampleRecipes(): Promise<void> {
  const { seedIfEmpty } = await import("@/db/seed");
  seedIfEmpty();
  revalidatePath("/recettes");
}
