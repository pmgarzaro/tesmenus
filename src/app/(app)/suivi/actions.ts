"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MEASURES } from "@/lib/body/measures";
import { deleteBodyEntry, saveBodyEntry } from "@/lib/body/repo";
import { JournalError, getTargets, setTargets } from "@/lib/journal/repo";

export type FormState = { error: string } | { ok: number } | null;

const owner = async () => {
  const u = await requireUser();
  return { userId: u.id, householdId: u.householdId };
};

/** Empty field = not given (keeps the day's previous value). */
const num = (v: FormDataEntryValue | null): number | undefined => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s ? Number(s) : undefined;
};

function message(err: unknown): string {
  if (err instanceof JournalError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Saisie invalide";
  throw err;
}

export async function saveMeasures(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const notes = String(form.get("notes") ?? "").trim();
    saveBodyEntry(await owner(), {
      date: String(form.get("date")),
      ...Object.fromEntries(MEASURES.map((m) => [m.key, num(form.get(m.key))])),
      ...(notes ? { notes } : {}),
    });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/suivi");
  return { ok: Date.now() };
}

export async function removeMeasures(form: FormData) {
  deleteBodyEntry(await owner(), String(form.get("date")));
  revalidatePath("/suivi");
}

export async function saveGoalWeight(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const o = await owner();
    const t = getTargets(o);
    setTargets(o, { ...t, notes: t.isDefault ? null : t.notes, goalWeightKg: num(form.get("goalWeightKg")) ?? null });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/suivi");
  return { ok: Date.now() };
}
