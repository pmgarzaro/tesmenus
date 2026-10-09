import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, today } from "@/lib/planning/dates";
import { getPlan } from "@/lib/planning/repo";
import { getRecipe } from "@/lib/recipes/repo";
import { type BatchDish, type BatchSheet, buildSheet } from "./sheet";

/** Cooked meals of a plan that can go into a batch session. */
export function batchCandidates(householdId: number, planId: number) {
  const plan = getPlan(householdId, planId);
  if (!plan) return null;
  return plan.entries
    .filter((e) => e.recipe && !e.isLeftover && !e.isEatingOut)
    .map((e) => ({
      entryId: e.id,
      date: e.date,
      slot: e.slot,
      recipeId: e.recipe!.id,
      title: e.recipe!.title,
      servings: e.servings ?? 2,
      eatDates: [e.date, ...plan.entries.filter((x) => x.sourceEntryId === e.id).map((x) => x.date)],
    }));
}

export type SessionInput = {
  planId: number | null;
  sessionDate: string;
  entryIds: number[];
  extra: { recipeId: number; servings: number }[];
};

function dish(householdId: number, key: string, recipeId: number, servings: number, eatDates: string[]): BatchDish | null {
  const r = getRecipe(householdId, recipeId);
  if (!r) return null;
  return {
    key,
    recipeId: r.id,
    title: r.title,
    tags: r.tags,
    recipeServings: r.servings,
    servings,
    fridgeDays: r.fridgeDays,
    freezable: r.freezable,
    ingredients: r.ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      name: i.name,
      label: i.label,
      aisle: i.aisle,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
    })),
    steps: r.steps.map((s) => ({
      text: s.text,
      durationMinutes: s.durationMinutes,
      type: s.type,
      equipment: s.equipment,
      temperature: s.temperature,
    })),
    eatDates,
  };
}

/** Cook mode for one library recipe, without a batch session (nothing saved). */
export function recipeSheet(householdId: number, recipeId: number): BatchSheet | null {
  const r = getRecipe(householdId, recipeId);
  const d = r && dish(householdId, `r${r.id}`, r.id, r.servings, []);
  return d ? buildSheet([d], today()) : null;
}

export function createSession(householdId: number, input: SessionInput): { id: number } | { error: string } {
  const dishes: BatchDish[] = [];
  if (input.planId !== null && input.entryIds.length) {
    const candidates = batchCandidates(householdId, input.planId);
    if (!candidates) return { error: "Planning introuvable." };
    for (const c of candidates.filter((x) => input.entryIds.includes(x.entryId))) {
      const d = dish(householdId, `e${c.entryId}`, c.recipeId, c.servings, c.eatDates);
      if (d) dishes.push(d);
    }
  }
  input.extra.forEach((x, i) => {
    const d = dish(householdId, `r${x.recipeId}-${i}`, x.recipeId, x.servings, []);
    if (d) dishes.push(d);
  });
  if (dishes.length < 2) return { error: "Choisis au moins 2 plats à préparer ensemble." };

  const sheet = buildSheet(dishes, input.sessionDate);
  const { id } = getDb()
    .insert(schema.batchSessions)
    .values({ householdId, planId: input.planId, selection: input, content: sheet })
    .returning({ id: schema.batchSessions.id })
    .get();
  return { id };
}

export function getSession(householdId: number, id: number) {
  const row = getDb()
    .select()
    .from(schema.batchSessions)
    .where(and(eq(schema.batchSessions.id, id), eq(schema.batchSessions.householdId, householdId)))
    .get();
  return row ? { ...row, sheet: row.content as BatchSheet } : null;
}

export function listSessions(householdId: number) {
  return getDb()
    .select()
    .from(schema.batchSessions)
    .where(eq(schema.batchSessions.householdId, householdId))
    .orderBy(desc(schema.batchSessions.id))
    .all()
    .map((r) => ({ id: r.id, planId: r.planId, createdAt: r.createdAt, sheet: r.content as BatchSheet }));
}

export function deleteSession(householdId: number, id: number): boolean {
  return (
    getDb()
      .delete(schema.batchSessions)
      .where(and(eq(schema.batchSessions.id, id), eq(schema.batchSessions.householdId, householdId)))
      .run().changes > 0
  );
}

/** Default session day: the day before the first meal, but not in the past. */
export function defaultSessionDate(firstMeal: string | undefined): string {
  const t = today();
  if (!firstMeal) return t;
  const before = addDays(firstMeal, -1);
  return before < t ? t : before;
}
