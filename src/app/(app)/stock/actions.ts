"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { JournalError } from "@/lib/journal/repo";
import { addStockItem, removeStockItems, updateStockItem } from "@/lib/stock/repo";
import type { StockLocation } from "@/lib/stock/stock";

export type FormState = { error: string } | { ok: number } | null;

function message(err: unknown): string {
  if (err instanceof JournalError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Saisie invalide";
  throw err;
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function fields(form: FormData) {
  return {
    name: str(form, "name"),
    quantity: str(form, "quantity") || null,
    location: (str(form, "location") || "frigo") as StockLocation,
    expiresOn: str(form, "expiresOn") || null,
    note: str(form, "note") || null,
  };
}

export async function addItem(_prev: FormState, form: FormData): Promise<FormState> {
  const { householdId } = await requireUser();
  try {
    addStockItem(householdId, fields(form));
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/stock");
  return { ok: Date.now() };
}

export async function updateItem(_prev: FormState, form: FormData): Promise<FormState> {
  const { householdId } = await requireUser();
  try {
    updateStockItem(householdId, Number(form.get("id")), fields(form));
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/stock");
  return { ok: Date.now() };
}

/** Eaten or thrown away: either way it leaves the stock. */
export async function removeItems(form: FormData) {
  const { householdId } = await requireUser();
  const ids = form.getAll("id").map(Number).filter(Number.isInteger);
  removeStockItems(householdId, ids);
  revalidatePath("/stock");
}
