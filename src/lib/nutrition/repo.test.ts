import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-nutri-"));
const { getDb, schema } = await import("@/db");
const { seedIfEmpty } = await import("@/db/seed");
const { createRecipe, getRecipe, listRecipeSummaries } = await import("@/lib/recipes/repo");
const { kcalPerServingByRecipe, recipeNutrition, saveIngredientNutrition } = await import("./repo");

let h: number;
let other: number;

beforeAll(() => {
  [h, other] = ["A", "B"].map((name) => getDb().insert(schema.households).values({ name }).returning().get().id);
  seedIfEmpty(h);
});

const base = {
  description: null,
  prepMinutes: 10,
  cookMinutes: 10,
  mealType: "plat" as const,
  tags: [],
  sourceUrl: null,
  fridgeDays: null,
  freezable: false,
  notes: null,
  steps: [{ text: "Cuire.", durationMinutes: 10, type: "cuisson" as const, equipment: null, temperature: null }],
};

describe("recipe nutrition", () => {
  it("estimates most sample recipes", () => {
    const map = kcalPerServingByRecipe(h);
    const all = listRecipeSummaries(h);
    expect(map.size).toBeGreaterThanOrEqual(Math.ceil(all.length * 0.8));
    for (const kcal of map.values()) expect(kcal).toBeGreaterThan(80), expect(kcal).toBeLessThan(1500);
  });

  it("uses the household's values for unknown ingredients, only for that household", () => {
    const id = createRecipe(
      h,
      {
        ...base,
        title: "Bol de kombucha",
        servings: 2,
        ingredients: [
          { quantity: 200, unit: "g", label: "riz", aisle: null, optional: false },
          { quantity: 2, unit: null, label: "galettes kombucha", aisle: null, optional: false },
        ],
      },
      "manuel",
    );
    let r = getRecipe(h, id)!;
    let n = recipeNutrition(r);
    expect(n.unknown).toMatchObject([{ label: "galettes kombucha", reason: "aliment" }]);
    const ing = r.ingredients.find((i) => i.name === "galette kombucha")!;

    expect(saveIngredientNutrition(other, ing.ingredientId, { gramsPerUnit: 50 }, "manuel")).toBe(false);
    expect(saveIngredientNutrition(h, ing.ingredientId, { per100: { kcal: 300, protein: 5, carbs: 60, fat: 4 } }, "manuel")).toBe(true);
    n = recipeNutrition(getRecipe(h, id)!);
    expect(n.unknown).toMatchObject([{ reason: "poids" }]);

    saveIngredientNutrition(h, ing.ingredientId, { gramsPerUnit: 50 }, "manuel");
    r = getRecipe(h, id)!;
    n = recipeNutrition(r);
    expect(n.unknown).toEqual([]);
    // 200 g riz (~350 kcal/100 g) + 100 g of galettes at 300 kcal, for 2.
    expect(n.perServing.kcal).toBeGreaterThan(450);
    expect(n.perServing.kcal).toBeLessThan(550);
    expect(n.details.find((d) => d.label === "galettes kombucha")).toMatchObject({ grams: 100, kcal: 300, source: "manuel" });
    expect(kcalPerServingByRecipe(h).get(id)).toBeCloseTo(n.perServing.kcal);
  });
});
