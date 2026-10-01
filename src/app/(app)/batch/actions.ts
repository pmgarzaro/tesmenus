"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSession, deleteSession } from "@/lib/batch/repo";
import { isValidDate } from "@/lib/planning/dates";

const schema = z.object({
  planId: z.number().int().nullable(),
  sessionDate: z.string().refine(isValidDate, "Date invalide"),
  entryIds: z.array(z.number().int()).max(30),
  extra: z.array(z.object({ recipeId: z.number().int(), servings: z.number().int().min(1).max(50) })).max(20),
});

export async function createSessionAction(input: z.infer<typeof schema>): Promise<string> {
  const { householdId } = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0].message;
  const res = createSession(householdId, parsed.data);
  if ("error" in res) return res.error;
  revalidatePath("/batch");
  redirect(`/batch/${res.id}`);
}

export async function deleteSessionAction(id: number): Promise<void> {
  const { householdId } = await requireUser();
  deleteSession(householdId, id);
  revalidatePath("/batch");
  redirect("/batch");
}
