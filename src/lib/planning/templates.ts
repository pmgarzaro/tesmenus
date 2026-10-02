// Saved plans ("modèles"): a week kept by name and replayed at any date.
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { TemplateEntry } from "@/db/schema";
import { dateRange } from "./dates";
import { type Slot, cellKey } from "./generate";
import { createPlan, getPlan } from "./repo";

/** Saves a plan as a template. Returns its id, or null if the plan is not the household's. */
export function saveTemplate(householdId: number, planId: number, name: string): number | null {
  const plan = getPlan(householdId, planId);
  if (!plan) return null;
  const dates = dateRange(plan.startDate, plan.days);
  const day = (date: string) => dates.indexOf(date);
  const entries: TemplateEntry[] = plan.entries.map((e) => ({
    day: day(e.date),
    slot: e.slot,
    recipeId: e.isLeftover ? null : e.recipeId,
    servings: e.isLeftover ? null : e.servings,
    isEatingOut: e.isEatingOut,
    leftoverOf: e.isLeftover && e.source ? { day: day(e.source.date), slot: e.source.slot } : null,
  }));
  return getDb()
    .insert(schema.planTemplates)
    .values({ householdId, name, days: plan.days, slots: plan.options.slots, entries })
    .returning({ id: schema.planTemplates.id })
    .get().id;
}

export function listTemplates(householdId: number) {
  const db = getDb();
  const titles = new Map(
    db
      .select({ id: schema.recipes.id, title: schema.recipes.title })
      .from(schema.recipes)
      .where(eq(schema.recipes.householdId, householdId))
      .all()
      .map((r) => [r.id, r.title]),
  );
  return db
    .select()
    .from(schema.planTemplates)
    .where(eq(schema.planTemplates.householdId, householdId))
    .orderBy(desc(schema.planTemplates.createdAt), desc(schema.planTemplates.id))
    .all()
    .map((t) => ({
      id: t.id,
      name: t.name,
      days: t.days,
      // Dishes in order, each once (deleted recipes are left out).
      dishes: [...new Set(t.entries.flatMap((e) => (e.recipeId && titles.has(e.recipeId) ? [titles.get(e.recipeId)!] : [])))],
    }));
}

export function renameTemplate(householdId: number, id: number, name: string): boolean {
  return (
    getDb()
      .update(schema.planTemplates)
      .set({ name })
      .where(and(eq(schema.planTemplates.id, id), eq(schema.planTemplates.householdId, householdId)))
      .run().changes > 0
  );
}

export function deleteTemplate(householdId: number, id: number): boolean {
  return (
    getDb()
      .delete(schema.planTemplates)
      .where(and(eq(schema.planTemplates.id, id), eq(schema.planTemplates.householdId, householdId)))
      .run().changes > 0
  );
}

/** Creates a plan starting at `startDate` with the meals of the template. */
export function createPlanFromTemplate(
  householdId: number,
  templateId: number,
  startDate: string,
): { id: number; warnings: string[] } | null {
  const db = getDb();
  const tpl = db
    .select()
    .from(schema.planTemplates)
    .where(and(eq(schema.planTemplates.id, templateId), eq(schema.planTemplates.householdId, householdId)))
    .get();
  if (!tpl) return null;
  const owned = new Set(
    db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(eq(schema.recipes.householdId, householdId))
      .all()
      .map((r) => r.id),
  );
  const { id } = createPlan(householdId, { startDate, days: tpl.days, slots: tpl.slots, constraints: {}, mode: "manual" });
  const dates = dateRange(startDate, tpl.days);
  const cells = new Map(getPlan(householdId, id)!.entries.map((e) => [cellKey(e.date, e.slot), e.id]));
  const cellOf = (day: number, slot: Slot) => (dates[day] ? cells.get(cellKey(dates[day], slot)) : undefined);
  const set = (entryId: number, values: Partial<typeof schema.mealPlanEntries.$inferInsert>) =>
    db.update(schema.mealPlanEntries).set(values).where(eq(schema.mealPlanEntries.id, entryId)).run();

  let missing = 0;
  const cooked = new Set<string>();
  db.transaction(() => {
    for (const e of tpl.entries) {
      const entryId = cellOf(e.day, e.slot);
      if (!entryId || e.leftoverOf) continue;
      if (e.isEatingOut) set(entryId, { isEatingOut: true });
      else if (e.recipeId && owned.has(e.recipeId)) {
        set(entryId, { recipeId: e.recipeId, servings: e.servings });
        cooked.add(`${e.day}|${e.slot}`);
      } else if (e.recipeId) missing++;
    }
    // Leftovers last, only when the meal they come from is still cooked.
    for (const e of tpl.entries) {
      const entryId = cellOf(e.day, e.slot);
      if (!entryId || !e.leftoverOf || !cooked.has(`${e.leftoverOf.day}|${e.leftoverOf.slot}`)) continue;
      set(entryId, { isLeftover: true, sourceEntryId: cellOf(e.leftoverOf.day, e.leftoverOf.slot)! });
    }
  });
  const warnings = missing
    ? [`${missing} recette${missing > 1 ? "s" : ""} du modèle n'existe${missing > 1 ? "nt" : ""} plus : repas laissé${missing > 1 ? "s" : ""} vide${missing > 1 ? "s" : ""}.`]
    : [];
  return { id, warnings };
}
