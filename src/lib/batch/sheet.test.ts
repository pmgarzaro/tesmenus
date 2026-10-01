import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-batch-"));
const { getDb, schema } = await import("@/db");
const { seedIfEmpty } = await import("@/db/seed");
const plans = await import("@/lib/planning/repo");
const batch = await import("./repo");
const { fridgeLimit } = await import("./sheet");

let h: number;
let other: number;
let planId: number;
const id = (title: string) => getDb().select().from(schema.recipes).all().find((r) => r.householdId === h && r.title === title)!.id;

beforeAll(() => {
  [h, other] = ["A", "B"].map((name) => getDb().insert(schema.households).values({ name }).returning().get().id);
  seedIfEmpty(h);
  // Mon: chili (leftovers Tue lunch) · Tue: gratin · Wed: saumon · Fri: curry.
  planId = plans.createPlan(h, { startDate: "2026-10-05", days: 5, slots: ["midi", "soir"], constraints: {}, mode: "manual" }).id;
  const p = plans.getPlan(h, planId)!;
  const cell = (d: string) => p.entries.find((e) => e.date === d && e.slot === "soir")!.id;
  plans.setEntryRecipe(h, cell("2026-10-05"), id("Chili con carne"));
  plans.setEntryRecipe(h, cell("2026-10-06"), id("Gratin dauphinois"));
  plans.setEntryRecipe(h, cell("2026-10-07"), id("Saumon au four et brocolis"));
  plans.setEntryRecipe(h, cell("2026-10-09"), id("Curry de pois chiches"));
});

describe("batch session", () => {
  it("lists the plan's cooked meals with the days they are eaten", () => {
    const c = batch.batchCandidates(h, planId)!;
    expect(c.map((x) => x.title)).toEqual(["Chili con carne", "Gratin dauphinois", "Saumon au four et brocolis", "Curry de pois chiches"]);
    expect(c[0].eatDates).toEqual(["2026-10-05", "2026-10-06"]);
    expect(batch.batchCandidates(other, planId)).toBeNull();
  });

  it("builds a complete sheet", () => {
    const entryIds = batch.batchCandidates(h, planId)!.map((x) => x.entryId);
    const res = batch.createSession(h, { planId, sessionDate: "2026-10-04", entryIds, extra: [] });
    expect("id" in res).toBe(true);
    const s = batch.getSession(h, (res as { id: number }).id)!.sheet;

    expect(s.dishes).toHaveLength(4);
    // Mise en place grouped by ingredient across recipes.
    const onion = s.miseEnPlace.find((m) => m.ingredient === "oignon" && m.verb === "Émincer")!;
    expect(onion.parts.map((p) => p.recipe)).toEqual(["Chili con carne", "Curry de pois chiches"]);
    expect(onion.total).toBe("3"); // 2 (chili, 4 portions) + 1 (curry, 4 portions)
    expect(s.miseEnPlace.some((m) => m.ingredient === "pomme de terre" && m.verb === "Éplucher")).toBe(true);
    // Totals for the session.
    // Chili 2 + gratin 1 + curry 2 × 2/4 (last dinner, cooked for 2).
    expect(s.ingredients.find((i) => i.name === "ail")!.amount).toBe("4 gousses");
    // Timeline covers every step and saves time.
    expect(s.timeline).toHaveLength(4 + 4 + 5 + 5);
    expect(s.totalMinutes).toBeLessThan(s.separateMinutes);
    // Conservation: saumon eaten Wednesday = 3 days after the session > 2 days, not freezable.
    const salmon = s.conservation.find((c) => c.title.startsWith("Saumon"))!;
    expect(salmon).toMatchObject({ fridgeDays: 2, storage: "attention" });
    // Curry eaten Friday (5 days later): freezable → frozen, thaw the day before.
    const curry = s.conservation.find((c) => c.title.startsWith("Curry"))!;
    expect(curry.storage).toBe("congelateur");
    expect(curry.advice.join(" ")).toMatch(/jeu\. 8 oct\./);
    const chili = s.conservation.find((c) => c.title.startsWith("Chili"))!;
    expect(chili.storage).toBe("frigo");
    expect(s.conservation.map((c) => c.title)[0]).toBe("Chili con carne"); // eaten first
    expect(s.warnings.join()).toMatch(/Saumon/);
  });

  it("accepts library recipes, refuses fewer than two dishes or another household", () => {
    const ok = batch.createSession(h, { planId: null, sessionDate: "2026-10-04", entryIds: [], extra: [{ recipeId: id("Quiche poireaux et chèvre"), servings: 6 }, { recipeId: id("Soupe de lentilles corail"), servings: 8 }] });
    expect("id" in ok).toBe(true);
    const sheet = batch.getSession(h, (ok as { id: number }).id)!.sheet;
    expect(sheet.ingredients.find((i) => i.name === "lentilles corail")!.amount).toBe("500 g");
    expect(sheet.conservation.every((c) => c.firstEat === null)).toBe(true);

    expect(batch.createSession(h, { planId: null, sessionDate: "2026-10-04", entryIds: [], extra: [{ recipeId: id("Quiche poireaux et chèvre"), servings: 6 }] })).toEqual({ error: expect.stringMatching(/au moins 2/) });
    expect(batch.getSession(other, (ok as { id: number }).id)).toBeNull();
    expect(batch.deleteSession(other, (ok as { id: number }).id)).toBe(false);
    expect(batch.listSessions(h)).toHaveLength(2);
  });

  it("caps fridge times prudently", () => {
    const base = { tags: [], ingredients: [] };
    expect(fridgeLimit({ ...base, title: "Saumon", fridgeDays: 5 })).toBe(2);
    expect(fridgeLimit({ ...base, title: "Poulet basquaise", fridgeDays: 5 })).toBe(3);
    expect(fridgeLimit({ ...base, title: "Soupe", fridgeDays: 6 })).toBe(4);
    expect(fridgeLimit({ ...base, title: "Soupe", fridgeDays: 1 })).toBe(1);
    expect(fridgeLimit({ ...base, title: "Soupe", fridgeDays: null })).toBe(3);
  });
});
