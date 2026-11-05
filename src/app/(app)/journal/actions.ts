"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { JournalError, type Owner, addLogEntry, deleteLogEntry, setTargets, updateLogEntry } from "@/lib/journal/repo";

export type FormState = { error: string } | { ok: number } | null;

const owner = async (): Promise<Owner> => {
  const u = await requireUser();
  return { userId: u.id, householdId: u.householdId };
};

/** "" → null, "12,5" → 12.5. */
const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

function message(err: unknown): string {
  if (err instanceof JournalError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Saisie invalide";
  throw err;
}

export async function addEntry(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    addLogEntry(await owner(), {
      date: String(form.get("date")),
      slot: String(form.get("slot")) as never,
      description: String(form.get("description") ?? ""),
      recipeId: num(form.get("recipeId")),
      servings: num(form.get("servings")),
      estKcal: num(form.get("estKcal")),
      estProteinG: num(form.get("estProteinG")),
      notes: str(form.get("notes")),
    });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/journal");
  return { ok: Date.now() };
}

export async function editEntry(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    updateLogEntry(await owner(), Number(form.get("id")), {
      slot: String(form.get("slot")) as never,
      description: String(form.get("description") ?? ""),
      servings: form.has("servings") ? num(form.get("servings")) : undefined,
      estKcal: num(form.get("estKcal")),
      estProteinG: num(form.get("estProteinG")),
    });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/journal");
  return { ok: Date.now() };
}

export async function removeEntry(form: FormData) {
  deleteLogEntry(await owner(), Number(form.get("id")));
  revalidatePath("/journal");
}

export async function saveTargets(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    setTargets(await owner(), {
      kcalPerDay: num(form.get("kcalPerDay")) ?? NaN,
      proteinG: num(form.get("proteinG")) ?? NaN,
      notes: str(form.get("notes")),
    });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/journal");
  return { ok: Date.now() };
}
