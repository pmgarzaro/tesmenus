"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { createInvite, requireUser } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "@/lib/password";
import { saveSettings } from "@/lib/settings";

export async function updateSettings(_prev: string | null, form: FormData): Promise<string | null> {
  await requireUser();
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
  await requireUser();
  const { seedIfEmpty } = await import("@/db/seed");
  seedIfEmpty();
  revalidatePath("/recettes");
}

/** Returns the invite path; the client turns it into a full URL. */
export async function generateInvite(): Promise<string> {
  const user = await requireUser();
  return `/signup?invite=${createInvite(user.id)}`;
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
