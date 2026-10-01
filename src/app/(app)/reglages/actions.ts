"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { testAi } from "@/lib/ai/gemini";
import { createInvite, requireUser } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "@/lib/password";
import { saveSettings } from "@/lib/settings";

export async function updateSettings(_prev: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  try {
    saveSettings(user.householdId, {
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
  const user = await requireUser();
  const { seedIfEmpty } = await import("@/db/seed");
  seedIfEmpty(user.householdId);
  revalidatePath("/recettes");
}

/**
 * "join": the newcomer shares this household's data (partner).
 * "new": the newcomer gets their own, separate household (friend, colleague).
 * Returns the invite path; the client turns it into a full URL.
 */
export async function generateInvite(kind: "join" | "new"): Promise<string> {
  const user = await requireUser();
  const token = createInvite(user.id, kind === "join" ? user.householdId : null);
  return `/signup?invite=${token}`;
}

export async function renameHousehold(_prev: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 60) return "Nom invalide";
  getDb()
    .update(schema.households)
    .set({ name })
    .where(eq(schema.households.id, user.householdId))
    .run();
  revalidatePath("/reglages");
  return "Nom enregistré";
}

export async function changePassword(_prev: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères`;
  }
  const db = getDb();
  const row = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()!;
  if (!(await verifyPassword(current, row.passwordHash))) return "Mot de passe actuel incorrect";
  db.update(schema.users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(schema.users.id, user.id))
    .run();
  return "Mot de passe modifié";
}

export async function setAiEnabled(enabled: boolean): Promise<void> {
  const user = await requireUser();
  saveSettings(user.householdId, { aiEnabled: enabled });
  revalidatePath("/reglages");
}

export async function testAiAction() {
  await requireUser();
  return testAi();
}
