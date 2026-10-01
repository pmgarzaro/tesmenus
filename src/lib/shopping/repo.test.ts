import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-shop-"));
const { getDb, schema } = await import("@/db");
const { seedIfEmpty } = await import("@/db/seed");
const plans = await import("@/lib/planning/repo");
const shop = await import("./repo");

let h: number;
let other: number;
let planId: number;
const recipeId = (title: string) => getDb().select().from(schema.recipes).all().find((r) => r.householdId === h && r.title === title)!.id;

beforeAll(() => {
  [h, other] = ["A", "B"].map((name) => getDb().insert(schema.households).values({ name }).returning().get().id);
  seedIfEmpty(h);
  // Hand-made plan: Monday chili (4 portions, leftovers Tuesday lunch), Tuesday bolognaise (2 portions).
  planId = plans.createPlan(h, { startDate: "2026-10-05", days: 2, slots: ["midi", "soir"], constraints: {}, mode: "manual" }).id;
  const p = plans.getPlan(h, planId)!;
  const cell = (d: string, s: string) => p.entries.find((e) => e.date === d && e.slot === s)!.id;
  plans.setEntryRecipe(h, cell("2026-10-05", "soir"), recipeId("Chili con carne"));
  plans.setEntryRecipe(h, cell("2026-10-06", "soir"), recipeId("Pâtes à la bolognaise"));
  plans.setServings(h, cell("2026-10-06", "soir"), 2);
});

const item = (list: NonNullable<ReturnType<typeof shop.getShoppingList>>, name: string) => list.items.find((i) => i.name === name)!;

describe("shopping list", () => {
  it("adds up the plan's ingredients, scaled, without leftover meals", () => {
    const list = shop.getShoppingList(h, planId)!;
    // Chili 500 g ×4/4 + bolognaise 400 g ×2/4.
    expect(item(list, "bœuf haché").amount).toBe("700 g");
    // Chili 2 + bolognaise 1 × 0.5.
    expect(item(list, "oignon").amount).toBe("3");
    expect(item(list, "oignon").recipes).toEqual(["Chili con carne", "Pâtes à la bolognaise"]);
    // Chili 400 g + bolognaise 800 g × 0.5.
    expect(item(list, "tomates concassées").amount).toBe("800 g");
    expect(item(list, "spaghetti").amount).toBe("200 g");
    expect(list.items.some((i) => i.name === "lentilles corail")).toBe(false);
    expect(shop.getShoppingList(other, planId)).toBeNull();
  });

  it("keeps checked / removed state, manual items and the pantry", () => {
    const beef = item(shop.getShoppingList(h, planId)!, "bœuf haché").ingredientId;
    expect(shop.setItemState(h, planId, beef, { checked: true })).toBe(true);
    const cumin = item(shop.getShoppingList(h, planId)!, "cumin").ingredientId;
    shop.setItemState(h, planId, cumin, { removed: true });
    expect(shop.addManualItem(h, planId, "Papier toilette")).toBe(true);
    expect(shop.addManualItem(h, planId, "2 citrons")).toBe(true);
    shop.setPantry(h, "huile d'olive", true);

    let list = shop.getShoppingList(h, planId)!;
    expect(item(list, "bœuf haché").checked).toBe(true);
    expect(item(list, "cumin").removed).toBe(true);
    expect(item(list, "huile d'olive").pantry).toBe(true);
    expect(list.manual.map((m) => [m.label, m.aisle])).toEqual([["Papier toilette", "epicerie"], ["2 citrons", "fruits-legumes"]]);

    shop.setManualChecked(h, planId, list.manual[0].id, true);
    expect(shop.uncheckAll(h, planId)).toBe(true);
    list = shop.getShoppingList(h, planId)!;
    expect(item(list, "bœuf haché").checked).toBe(false);
    expect(list.manual[0].checked).toBe(false);
    expect(shop.deleteManualItem(h, planId, list.manual[1].id)).toBe(true);
    expect(shop.getShoppingList(h, planId)!.manual).toHaveLength(1);

    // Other household can't touch anything.
    expect(shop.setItemState(other, planId, beef, { checked: true })).toBe(false);
    expect(shop.addManualItem(other, planId, "x")).toBe(false);
    expect(shop.deleteManualItem(other, planId, list.manual[0].id)).toBe(false);
  });

  it("follows plan changes", () => {
    const p = plans.getPlan(h, planId)!;
    plans.setEatingOut(h, p.entries.find((e) => e.date === "2026-10-06" && e.slot === "soir")!.id);
    const list = shop.getShoppingList(h, planId)!;
    expect(item(list, "bœuf haché").amount).toBe("500 g");
    expect(list.items.some((i) => i.name === "spaghetti")).toBe(false);
  });
});
