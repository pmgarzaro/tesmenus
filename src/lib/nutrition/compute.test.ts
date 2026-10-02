import { describe, expect, it } from "vitest";
import { SEED_RECIPES } from "@/db/seed-data";
import { parseIngredientLine } from "@/lib/recipes/normalize";
import { type NutritionLine, computeNutrition, energySplit, lookupNutrition, toGrams } from "./compute";

const line = (text: string, extra: Partial<NutritionLine> = {}): NutritionLine => {
  const p = parseIngredientLine(text);
  return { quantity: p.quantity, unit: p.unit, name: p.name, label: p.label, optional: p.optional, ...extra };
};

describe("lookupNutrition", () => {
  it("finds exact names, variants and the longest known name", () => {
    expect(lookupNutrition("Oignons jaunes")?.kcal).toBe(40);
    expect(lookupNutrition("huile d'olive vierge extra")?.fat).toBe(100);
    expect(lookupNutrition("lait de coco")?.kcal).toBe(180); // not "lait"
    expect(lookupNutrition("pavé de saumon")?.piece).toBe(125);
    expect(lookupNutrition("bœuf haché")?.kcal).toBe(215);
    expect(lookupNutrition("filet de poulet fermier")?.kcal).toBe(110);
    expect(lookupNutrition("kombucha maison")).toBeNull();
  });
});

describe("toGrams", () => {
  it.each([
    [200, "g", "farine", undefined, 200],
    [1.5, "kg", "pomme de terre", undefined, 1500],
    [20, "cl", "crème liquide", undefined, 200],
    [2, "cas", "huile d'olive", undefined, 27.6],
    [2, "cas", "sucre", undefined, 30],
    [3, "cac", "sucre", undefined, 15],
    [2, "piece", "oignon", 100, 200],
    [2, "piece", "truc", undefined, null],
    [3, "gousse", "ail", 5, 15],
    [1, "boite", "tomates concassées", 400, 400],
    [1, "boite", "maïs", undefined, 400],
  ] as const)("%s %s %s", (q, unit, name, piece, expected) => {
    const g = toGrams(q, unit, name, piece);
    if (expected === null) expect(g).toBeNull();
    else expect(g).toBeCloseTo(expected, 1);
  });
});

describe("computeNutrition", () => {
  it("estimates the sample chili per portion", () => {
    const chili = SEED_RECIPES.find((r) => r.title === "Chili con carne")!;
    const lines = chili.ingredients.map(([, , , , text]) => line(text));
    const r = computeNutrition(lines, chili.servings);
    expect(r.unknown).toEqual([]);
    expect(r.coverage).toBe(1);
    // 500 g beef (1075) + 2 onions (80) + garlic (13) + pepper (39) + beans 250 g (263) + tomatoes 400 g (100) + cumin + 2 tbsp oil (248) ≈ 1830 kcal / 4
    expect(r.perServing.kcal).toBeGreaterThan(420);
    expect(r.perServing.kcal).toBeLessThan(500);
    expect(r.perServing.protein).toBeGreaterThan(25);
  });

  it("lists unknown ingredients and skips optional ones and those without quantity", () => {
    const r = computeNutrition(
      [line("200 g de farine"), line("2 truffes"), line("1 c. à s. de sauce mystère"), line("Sel, poivre"), line("1 botte de coriandre (facultatif)")],
      2,
    );
    expect(r.unknown).toMatchObject([{ label: "truffes", reason: "aliment" }, { label: "sauce mystère", reason: "aliment" }]);
    expect(r.coverage).toBeCloseTo(1 / 3);
    expect(r.perServing.kcal).toBeCloseTo(345, 0);
  });

  it("uses the household's own values first", () => {
    const custom = { per100: { kcal: 100, protein: 10, carbs: 5, fat: 2 }, gramsPerUnit: 80, source: "manuel" as const };
    const r = computeNutrition([line("2 truffes", { custom })], 1);
    expect(r.unknown).toEqual([]);
    expect(r.total.kcal).toBeCloseTo(160);
    const weightUnknown = computeNutrition([line("2 truffes", { custom: { ...custom, gramsPerUnit: null } })], 1);
    expect(weightUnknown.unknown).toMatchObject([{ label: "truffes", reason: "poids" }]);
  });

  it("splits energy between macros", () => {
    const s = energySplit({ kcal: 0, protein: 25, carbs: 50, fat: 10 });
    expect(s.protein + s.carbs + s.fat).toBeCloseTo(1);
    expect(s.carbs).toBeCloseTo(200 / 390);
  });
});
