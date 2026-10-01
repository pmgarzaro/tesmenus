"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiEnabledFor } from "@/lib/ai/enabled";
import { ImportError, type ImportResult, importFromText, importFromUrl } from "@/lib/import";

export type ImportResponse =
  | { ok: true; result: ImportResult; duplicate: { id: number; title: string } | null }
  | { ok: false; error: string };

function findDuplicate(householdId: number, url: string | null) {
  if (!url) return null;
  return (
    getDb()
      .select({ id: schema.recipes.id, title: schema.recipes.title })
      .from(schema.recipes)
      .where(and(eq(schema.recipes.householdId, householdId), eq(schema.recipes.sourceUrl, url)))
      .get() ?? null
  );
}

export async function importUrl(url: string): Promise<ImportResponse> {
  const { householdId } = await requireUser();
  try {
    const result = await importFromUrl(url, { ai: aiEnabledFor(householdId) });
    return { ok: true, result, duplicate: findDuplicate(householdId, result.draft.sourceUrl) };
  } catch (e) {
    const error = e instanceof ImportError ? e.message : "Extraction échouée.";
    if (!(e instanceof ImportError)) console.error("Import URL", url, e);
    return { ok: false, error };
  }
}

export async function importText(text: string): Promise<ImportResponse> {
  const { householdId } = await requireUser();
  if (!text.trim()) return { ok: false, error: "Colle d'abord le texte de la recette." };
  if (text.length > 50_000) return { ok: false, error: "Texte trop long." };
  const result = await importFromText(text, { ai: aiEnabledFor(householdId) });
  if (result.draft.ingredients.length === 0 && result.draft.steps.length === 0) {
    return { ok: false, error: "Aucun ingrédient ni étape reconnu. Ajoute des titres « Ingrédients » et « Préparation »." };
  }
  return { ok: true, result, duplicate: null };
}
