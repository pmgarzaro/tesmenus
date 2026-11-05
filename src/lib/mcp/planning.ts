// Meal plans and shopping lists for Claude: create a plan, change a meal,
// list what to buy for a period. Built on the app's planning and shopping code.
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { dateSchema } from "@/lib/journal/input";
import { JournalError, type Owner } from "@/lib/journal/repo";
import { AISLE_LABELS } from "@/lib/labels";
import { addDays, dateRange } from "@/lib/planning/dates";
import * as plans from "@/lib/planning/repo";
import { fold, normalizeTags } from "@/lib/recipes/normalize";
import { getSettings } from "@/lib/settings";
import { AISLE_ORDER, aggregate, formatItemAmounts } from "@/lib/shopping/aggregate";
import { linesOf } from "@/lib/shopping/repo";

const TO_APP = { breakfast: "matin", lunch: "midi", dinner: "soir" } as const;
const TO_API = { matin: "breakfast", midi: "lunch", soir: "dinner" } as const;
const SLOT_FR = { breakfast: "petit-déjeuner", lunch: "midi", dinner: "soir" } as const;
type ApiSlot = keyof typeof TO_APP;

const slotSchema = z.enum(["breakfast", "lunch", "dinner"], {
  message: "Créneau : breakfast (petit-déjeuner), lunch (midi) ou dinner (soir)",
});

// ---------------------------------------------------------------------------
// Reading a plan

export function planView(owner: Owner, planId: number, warnings: string[] = []) {
  const p = plans.getPlan(owner.householdId, planId);
  if (!p) throw new JournalError(`Planning ${planId} introuvable`);
  return {
    plan_id: p.id,
    start_date: p.startDate,
    end_date: addDays(p.startDate, p.days - 1),
    meals: p.entries.map((e) => ({
      date: e.date,
      slot: TO_API[e.slot],
      recipe_id: e.recipe?.id ?? null,
      recipe_name: e.recipe?.title ?? null,
      servings_planned: e.isLeftover || e.isEatingOut ? null : e.servings,
      is_leftover: e.isLeftover,
      leftover_of: e.source ? { date: e.source.date, slot: TO_API[e.source.slot] } : null,
      is_eating_out: e.isEatingOut,
      label: e.label,
      note: e.note,
    })),
    warnings,
  };
}

/** The meal at a date and slot, in the most recent plan covering that date. */
function entryAt(owner: Owner, date: string, slot: ApiSlot) {
  const row = getDb()
    .select({ entry: schema.mealPlanEntries })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.mealPlans, eq(schema.mealPlans.id, schema.mealPlanEntries.planId))
    .where(
      and(
        eq(schema.mealPlans.householdId, owner.householdId),
        eq(schema.mealPlanEntries.date, date),
        eq(schema.mealPlanEntries.slot, TO_APP[slot]),
      ),
    )
    .orderBy(desc(schema.mealPlans.id))
    .get();
  if (!row) throw new JournalError(`Aucun planning ne contient le ${SLOT_FR[slot]} du ${date}`);
  return row.entry;
}

function assertRecipe(owner: Owner, recipeId: number) {
  const r = getDb()
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, owner.householdId)))
    .get();
  if (!r) throw new JournalError(`Recette ${recipeId} introuvable`);
}

// ---------------------------------------------------------------------------
// Creating a plan

const mealShape = z.object({
  date: dateSchema,
  slot: slotSchema,
  recipe_id: z.number().int().positive().optional().describe("Recette à cuisiner"),
  label: z.string().min(1).max(120).optional().describe("Repas sans recette, en texte libre : « raclette », « McDo », « chez les beaux-parents »"),
  eating_out: z.boolean().optional().describe("Repas pris dehors (seul, ou avec label)"),
  leftovers_of: z.object({ date: dateSchema, slot: slotSchema }).optional().describe("Restes d'un repas cuisiné plus tôt dans ce planning"),
  servings: z.number().int().min(1).max(50).optional().describe("Portions à cuisiner (sinon : réglages du foyer)"),
  servings_planned: z.number().int().min(1).max(50).optional().describe("Synonyme de servings"),
  note: z.string().max(300).optional().describe("Consigne pour ce repas : « 200 g de lieu et de pommes de terre »"),
});

export const createPlanShape = {
  start_date: dateSchema.optional().describe("Premier jour. Par défaut : lendemain de la fin du planning en cours"),
  days: z.number().int().min(1).max(14).optional().describe("Nombre de jours (réglage du foyer par défaut)"),
  slots: z
    .array(slotSchema)
    .min(1)
    .optional()
    .describe("Créneaux planifiés : breakfast, lunch, dinner (réglage du foyer par défaut). Les petits-déjeuners utilisent les recettes de type petit-dejeuner"),
  meals: z
    .array(mealShape)
    .max(28)
    .optional()
    .describe("Repas choisis : recette ou repas extérieur. Un dîner couvre le midi suivant s'il est libre (restes), selon les réglages"),
  fill_rest: z
    .boolean()
    .optional()
    .describe("Compléter les repas non choisis par l'algorithme de l'app (par défaut : oui sans `meals`, non avec)"),
  include_recipe_ids: z.array(z.number().int().positive()).max(14).optional().describe("Recettes à placer obligatoirement (tirage automatique)"),
  exclude_tags: z.array(z.string().max(40)).max(20).optional().describe("Tags à éviter, ex. poisson"),
  only_freezable: z.boolean().optional(),
  max_minutes_by_date: z.record(dateSchema, z.number().int().min(5).max(600)).optional().describe("Temps max de cuisine par jour"),
};

type CreateArgs = z.infer<z.ZodObject<typeof createPlanShape>>;

export function createPlanFromMcp(owner: Owner, a: CreateArgs) {
  const h = owner.householdId;
  const s = getSettings(h);
  const startDate = a.start_date ?? plans.nextFreeStartDate(h);
  const days = a.days ?? s.defaultDays;
  const slots = a.slots ? [...new Set(a.slots.map((x) => TO_APP[x]))] : s.activeSlots;
  const overlap = plans.overlapMessage(h, startDate, days);
  if (overlap) throw new JournalError(overlap);
  const dates = new Set(dateRange(startDate, days));
  const meals = a.meals ?? [];
  for (const m of meals) {
    if (!dates.has(m.date)) throw new JournalError(`Le repas du ${m.date} est hors du planning (${startDate} + ${days} jours)`);
    if (!slots.includes(TO_APP[m.slot])) throw new JournalError(`Le créneau ${m.slot} n'est pas dans ce planning`);
    const kinds = [!!m.recipe_id, !!m.label || !!m.eating_out, !!m.leftovers_of].filter(Boolean).length;
    if (kinds !== 1 && !(kinds === 0 && m.note)) {
      throw new JournalError(`Repas du ${m.date} ${m.slot} : donner recipe_id, OU label / eating_out, OU leftovers_of`);
    }
    if (m.recipe_id) assertRecipe(owner, m.recipe_id);
  }
  for (const id of a.include_recipe_ids ?? []) assertRecipe(owner, id);

  const constraints = {
    maxMinutesByDate: Object.fromEntries(Object.entries(a.max_minutes_by_date ?? {}).filter(([d]) => dates.has(d))),
    include: a.include_recipe_ids ?? [],
    onlyFreezable: a.only_freezable ?? false,
    excludeTags: normalizeTags(a.exclude_tags ?? []),
  };
  const fillRest = a.fill_rest ?? meals.length === 0;
  const { id, warnings } = plans.createPlan(h, { startDate, days, slots, constraints, mode: meals.length || !fillRest ? "manual" : "auto" });

  // Chosen meals: dinners last so that their leftovers only take still-empty lunches.
  const rank = { breakfast: 0, lunch: 1, dinner: 2 } as const;
  const cell = (date: string, slot: ApiSlot) =>
    plans.getPlan(h, id)!.entries.find((e) => e.date === date && e.slot === TO_APP[slot])!;
  const ordered = [...meals].sort((x, y) => rank[x.slot] - rank[y.slot] || x.date.localeCompare(y.date));
  for (const m of ordered) {
    const e = cell(m.date, m.slot);
    if (m.label) plans.setEntryLabel(h, e.id, m.label, m.eating_out ?? false);
    else if (m.eating_out) plans.setEatingOut(h, e.id);
    else if (m.recipe_id) plans.setEntryRecipe(h, e.id, m.recipe_id);
  }
  // Leftovers once every cooked meal is in place.
  for (const m of meals) {
    if (!m.leftovers_of) continue;
    const ok = plans.setLeftover(h, cell(m.date, m.slot).id, cell(m.leftovers_of.date, m.leftovers_of.slot).id);
    if (!ok) throw new JournalError(`Restes impossibles pour le ${m.date} ${m.slot} : le repas source doit être cuisiné, plus tôt et du même type`);
  }
  for (const m of meals) {
    const servings = m.servings ?? m.servings_planned;
    if (servings && m.recipe_id) plans.setServings(h, cell(m.date, m.slot).id, servings);
    if (m.note) plans.setEntryNote(h, cell(m.date, m.slot).id, m.note);
  }
  const more = meals.length && fillRest ? (plans.fillEmptyEntries(h, id) ?? []) : [];
  return planView(owner, id, [...new Set([...warnings, ...more])]);
}

// ---------------------------------------------------------------------------
// Changing one meal

export const setMealShape = {
  date: dateSchema,
  slot: slotSchema,
  recipe_id: z.number().int().positive().optional().describe("Cuisiner cette recette"),
  eating_out: z.boolean().optional().describe("true : repas à l'extérieur"),
  leftovers_of: z.object({ date: dateSchema, slot: slotSchema }).optional().describe("Manger les restes de ce repas (même planning, avant)"),
  label: z.string().min(1).max(120).optional().describe("Repas sans recette, en texte libre (avec eating_out: true s'il est pris dehors)"),
  clear: z.boolean().optional().describe("true : vider le repas (recette, texte et note)"),
  servings: z.number().int().min(1).max(50).optional().describe("Portions à cuisiner (seul ou avec recipe_id)"),
  servings_planned: z.number().int().min(1).max(50).optional().describe("Synonyme de servings"),
  note: z.string().max(300).nullable().optional().describe("Consigne pour ce repas, cumulable avec une autre action ; null l'efface"),
};

type SetArgs = z.infer<z.ZodObject<typeof setMealShape>>;

export function setPlannedMeal(owner: Owner, a: SetArgs) {
  const h = owner.householdId;
  const e = entryAt(owner, a.date, a.slot);
  const servings = a.servings ?? a.servings_planned;
  const actions = [a.recipe_id !== undefined, !!a.eating_out || !!a.label, !!a.leftovers_of, !!a.clear].filter(Boolean).length;
  if (actions > 1) throw new JournalError("Une seule action à la fois : recipe_id, label / eating_out, leftovers_of ou clear");
  if (actions === 0 && servings === undefined && a.note === undefined) {
    throw new JournalError("Rien à changer : donner recipe_id, label, eating_out, leftovers_of, clear, servings ou note");
  }
  if (a.label) {
    plans.setEntryLabel(h, e.id, a.label, a.eating_out ?? false);
  } else if (a.recipe_id !== undefined) {
    assertRecipe(owner, a.recipe_id);
    plans.setEntryRecipe(h, e.id, a.recipe_id);
  } else if (a.eating_out) {
    plans.setEatingOut(h, e.id);
  } else if (a.clear) {
    plans.clearEntry(h, e.id);
  } else if (a.leftovers_of) {
    const source = entryAt(owner, a.leftovers_of.date, a.leftovers_of.slot);
    if (!plans.setLeftover(h, e.id, source.id)) {
      throw new JournalError(
        "Restes impossibles : le repas source doit être cuisiné, plus tôt, dans le même planning, et du même type (petit-déjeuner ↔ petit-déjeuner)",
      );
    }
  }
  if (servings !== undefined && !plans.setServings(h, e.id, servings)) {
    throw new JournalError("Portions modifiables seulement sur un repas cuisiné");
  }
  if (a.note !== undefined) plans.setEntryNote(h, e.id, a.note);
  return planView(owner, e.planId);
}

// ---------------------------------------------------------------------------
// Shopping list for any period (may span several plans)

export function shoppingListView(owner: Owner, from: string, to: string) {
  if (to < from) throw new JournalError("date_to doit être postérieure ou égale à date_from");
  if (addDays(from, 30) < to) throw new JournalError("Période trop longue : 31 jours maximum");
  const rows = getDb()
    .select({ entry: schema.mealPlanEntries, planId: schema.mealPlans.id })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.mealPlans, eq(schema.mealPlans.id, schema.mealPlanEntries.planId))
    .where(
      and(
        eq(schema.mealPlans.householdId, owner.householdId),
        gte(schema.mealPlanEntries.date, from),
        lte(schema.mealPlanEntries.date, to),
      ),
    )
    .orderBy(desc(schema.mealPlans.id))
    .all();
  const seen = new Set<string>();
  const entries = rows
    .filter(({ entry }) => {
      const k = `${entry.date}|${entry.slot}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((r) => r.entry);
  const lines = linesOf(entries);
  const pantry = new Set(getSettings(owner.householdId).pantry.map(fold));
  const items = aggregate(lines);
  const titles = new Map(lines.map((l) => [l.recipe, true]));
  return {
    date_from: from,
    date_to: to,
    meals_counted: entries
      .filter((e) => e.recipeId !== null && !e.isLeftover && !e.isEatingOut)
      .sort((x, y) => x.date.localeCompare(y.date) || x.slot.localeCompare(y.slot))
      .map((e) => ({ date: e.date, slot: TO_API[e.slot], servings: e.servings })),
    recipes: [...titles.keys()],
    items: AISLE_ORDER.flatMap((aisle) =>
      items
        .filter((i) => i.aisle === aisle)
        .map((i) => ({
          name: i.name,
          aisle: AISLE_LABELS[aisle],
          amount: formatItemAmounts(i) || null,
          quantities: i.amounts.map((x) => ({ amount: Math.round(x.quantity * 100) / 100, unit: x.unit })),
          recipes: i.recipes,
          ...(i.optional ? { optional: true } : {}),
          ...(pantry.has(fold(i.name)) ? { always_in_pantry: true } : {}),
        })),
    ),
    note: "Restes et repas extérieurs non comptés : les ingrédients comptent le jour où le plat est cuisiné. always_in_pantry = « toujours au placard » dans l'app.",
  };
}
