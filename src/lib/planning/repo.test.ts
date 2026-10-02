import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-plan-"));
const { getDb, schema } = await import("@/db");
const { seedIfEmpty } = await import("@/db/seed");
const plans = await import("./repo");
type FullPlan = import("./repo").FullPlan;

let h: number;
let other: number;
const input = { startDate: "2026-10-05", days: 5, slots: ["midi", "soir"] as ("midi" | "soir")[], constraints: {} };

beforeAll(() => {
  [h, other] = ["A", "B"].map((name) => getDb().insert(schema.households).values({ name }).returning().get().id);
  seedIfEmpty(h);
  seedIfEmpty(other);
});

const cell = (p: FullPlan, date: string, slot: string) => p.entries.find((e) => e.date === date && e.slot === slot)!;

describe("plans", () => {
  it("creates a full week with leftovers", () => {
    const { id, warnings } = plans.createPlan(h, input);
    expect(warnings).toEqual([]);
    const p = plans.getPlan(h, id)!;
    expect(p.entries).toHaveLength(10);
    expect(p.entries.map((e) => `${e.date.slice(8)}${e.slot[0]}`).slice(0, 4)).toEqual(["05m", "05s", "06m", "06s"]);
    const lunch = cell(p, "2026-10-06", "midi");
    const dinner = cell(p, "2026-10-05", "soir");
    expect(lunch).toMatchObject({ isLeftover: true, sourceEntryId: dinner.id });
    expect(lunch.recipe!.id).toBe(dinner.recipeId);
    expect(dinner).toMatchObject({ servings: 4, hasLeftovers: true });
    expect(cell(p, "2026-10-05", "midi").servings).toBe(2);
    expect(plans.getPlan(other, id)).toBeNull();
  });

  it("edits cells: change, eat out, leftovers, servings, swap, reroll", () => {
    const { id } = plans.createPlan(h, { ...input, startDate: "2026-10-12" });
    let p = plans.getPlan(h, id)!;
    const mon = cell(p, "2026-10-12", "soir");
    const tueLunch = cell(p, "2026-10-13", "midi");
    const tue = cell(p, "2026-10-13", "soir");

    // Eating out on Monday evening frees Tuesday lunch.
    expect(plans.setEatingOut(h, mon.id)).toBe(true);
    p = plans.getPlan(h, id)!;
    expect(cell(p, "2026-10-12", "soir")).toMatchObject({ isEatingOut: true, recipeId: null });
    expect(cell(p, "2026-10-13", "midi")).toMatchObject({ isLeftover: false, recipeId: null, sourceEntryId: null });

    // Tuesday lunch eats the leftovers of Monday lunch.
    const monLunch = cell(p, "2026-10-12", "midi");
    expect(plans.setLeftover(h, tueLunch.id, monLunch.id)).toBe(true);
    p = plans.getPlan(h, id)!;
    expect(cell(p, "2026-10-13", "midi").recipe!.id).toBe(monLunch.recipeId);
    expect(cell(p, "2026-10-12", "midi").servings).toBe(4); // now cooks for two meals
    // …but not from a later meal.
    expect(plans.setLeftover(h, monLunch.id, tue.id)).toBe(false);

    // Pick a recipe by hand, change servings.
    const chili = getDb().select().from(schema.recipes).all().find((r) => r.householdId === h && r.title === "Chili con carne")!;
    expect(plans.setEntryRecipe(h, mon.id, chili.id)).toBe(true);
    expect(plans.setServings(h, mon.id, 6)).toBe(true);
    p = plans.getPlan(h, id)!;
    expect(cell(p, "2026-10-12", "soir")).toMatchObject({ recipeId: chili.id, servings: 6, isEatingOut: false });

    // Swap Monday and Tuesday evenings.
    const tueRecipe = cell(p, "2026-10-13", "soir").recipeId;
    expect(plans.swapEntries(h, mon.id, tue.id)).toBe(true);
    p = plans.getPlan(h, id)!;
    expect(cell(p, "2026-10-12", "soir").recipeId).toBe(tueRecipe);
    expect(cell(p, "2026-10-13", "soir").recipeId).toBe(chili.id);
    expect(plans.swapEntries(h, mon.id, tueLunch.id)).toBe(false); // leftover meals stay put

    // Reroll keeps the rest of the week and changes this meal.
    const before = plans.getPlan(h, id)!.entries.map((e) => [e.id, e.recipeId]);
    expect(plans.rerollEntry(h, tue.id)).toBe(true);
    const after = plans.getPlan(h, id)!.entries;
    expect(cell(plans.getPlan(h, id)!, "2026-10-13", "soir").recipeId).not.toBe(chili.id);
    expect(after.filter((e) => e.id !== tue.id).map((e) => [e.id, e.recipeId])).toEqual(before.filter(([eid]) => eid !== tue.id));

    // Another household cannot touch it.
    const foreign = getDb().select().from(schema.recipes).all().find((r) => r.householdId === other)!;
    expect(plans.setEntryRecipe(h, mon.id, foreign.id)).toBe(false);
    expect(plans.setEatingOut(other, mon.id)).toBe(false);
    expect(plans.deletePlan(other, id)).toBe(false);
  });

  it("avoids the previous week's recipes, lists history, finds the current plan", () => {
    const week1 = plans.getPlan(h, plans.listPlans(h).find((p) => p.startDate === "2026-10-05")!.id)!;
    const used = new Set(week1.entries.map((e) => e.recipeId).filter(Boolean));
    const { id } = plans.createPlan(h, { ...input, startDate: "2026-10-12", days: 2 });
    const next = plans.getPlan(h, id)!;
    // 8 sample recipes, 6 used last week: the 2-day plan (3 cooked meals) needs at most 1 repeat.
    const repeats = next.entries.filter((e) => !e.isLeftover && used.has(e.recipeId)).length;
    expect(repeats).toBeLessThanOrEqual(1);

    expect(plans.listPlans(h).length).toBe(3);
    expect(plans.listPlans(other)).toEqual([]);
    expect(plans.currentPlanId(h)).not.toBeNull();
    expect(plans.deletePlan(h, id)).toBe(true);
    expect(plans.getPlan(h, id)).toBeNull();
  });

  it("creates an empty plan to fill by hand, with leftovers linked automatically", () => {
    const { id, warnings } = plans.createPlan(h, { ...input, startDate: "2026-11-09", mode: "manual" });
    expect(warnings).toEqual([]);
    let p = plans.getPlan(h, id)!;
    expect(p.entries).toHaveLength(10);
    expect(p.entries.every((e) => !e.recipeId && !e.isLeftover && !e.isEatingOut)).toBe(true);

    const recipes = getDb().select().from(schema.recipes).all().filter((r) => r.householdId === h);
    const monDinner = cell(p, "2026-11-09", "soir");
    expect(plans.setEntryRecipe(h, monDinner.id, recipes[0].id)).toBe(true);
    p = plans.getPlan(h, id)!;
    expect(cell(p, "2026-11-10", "midi")).toMatchObject({ isLeftover: true, sourceEntryId: monDinner.id });
    expect(cell(p, "2026-11-09", "soir").servings).toBe(4);

    // A lunch already chosen is not overwritten.
    const wedLunch = cell(p, "2026-11-11", "midi");
    plans.setEntryRecipe(h, wedLunch.id, recipes[1].id);
    plans.setEntryRecipe(h, cell(p, "2026-11-10", "soir").id, recipes[2].id);
    p = plans.getPlan(h, id)!;
    expect(cell(p, "2026-11-11", "midi")).toMatchObject({ recipeId: recipes[1].id, isLeftover: false });
    expect(cell(p, "2026-11-10", "soir").servings).toBe(2);

    // Friday evening out, then complete the rest at random.
    plans.setEatingOut(h, cell(p, "2026-11-13", "soir").id);
    const chosen = p.entries.filter((e) => e.recipeId).map((e) => [e.id, e.recipeId]);
    expect(plans.fillEmptyEntries(h, id)).toEqual([]);
    p = plans.getPlan(h, id)!;
    for (const [eid, rid] of chosen) expect(p.entries.find((e) => e.id === eid)!.recipeId).toBe(rid);
    expect(cell(p, "2026-11-13", "soir").isEatingOut).toBe(true);
    expect(p.entries.filter((e) => !e.recipeId && !e.isLeftover && !e.isEatingOut)).toEqual([]);
    expect(cell(p, "2026-11-12", "midi").isLeftover).toBe(true); // Wednesday dinner feeds Thursday lunch
    const cookedIds = p.entries.filter((e) => e.recipeId && !e.isLeftover).map((e) => e.recipeId);
    expect(new Set(cookedIds).size).toBe(cookedIds.length);
    expect(plans.fillEmptyEntries(other, id)).toBeNull();
  });

  it("regenerates a whole plan", () => {
    const { id } = plans.createPlan(h, { ...input, startDate: "2026-11-02" });
    expect(plans.regeneratePlan(h, id)).toEqual([]);
    expect(plans.getPlan(h, id)!.entries).toHaveLength(10);
    expect(plans.regeneratePlan(other, id)).toBeNull();
  });
});

describe("settings sync", () => {
  it("turning leftovers off replaces upcoming leftover meals", async () => {
    const { saveSettings } = await import("@/lib/settings");
    const c = getDb().insert(schema.households).values({ name: "C" }).returning().get().id;
    seedIfEmpty(c);
    const start = (await import("./dates")).addDays((await import("./dates")).today(), 1);
    const { id } = plans.createPlan(c, { ...input, startDate: start });
    expect(plans.getPlan(c, id)!.entries.some((e) => e.isLeftover)).toBe(true);

    saveSettings(c, { dinnerCoversNextLunch: false });
    expect(plans.syncOpenPlansWithSettings(c)).toBe(1);
    const p = plans.getPlan(c, id)!;
    expect(p.entries.some((e) => e.isLeftover)).toBe(false);
    expect(p.entries.every((e) => e.recipeId !== null)).toBe(true);
    expect(p.entries.every((e) => e.servings === 2)).toBe(true);
    expect(p.options.dinnerCoversNextLunch).toBe(false);

    // Regenerating now follows the new setting.
    plans.regeneratePlan(c, id);
    expect(plans.getPlan(c, id)!.entries.some((e) => e.isLeftover)).toBe(false);
  });
});
