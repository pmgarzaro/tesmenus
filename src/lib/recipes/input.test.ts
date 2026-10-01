import { describe, expect, it } from "vitest";
import { EMPTY_RECIPE, type RecipeInput, recipeInputSchema } from "./input";

const valid: RecipeInput = {
  ...EMPTY_RECIPE,
  title: "Soupe",
  ingredients: [{ quantity: 2, unit: "piece", label: "carottes", aisle: null, optional: false }],
  steps: [{ text: "Cuire", durationMinutes: 20, type: "cuisson", equipment: "plaque", temperature: null }],
};

const error = (over: Record<string, unknown>) => {
  const r = recipeInputSchema.safeParse({ ...valid, ...over });
  return r.success ? null : r.error.issues[0].message;
};

describe("recipeInputSchema", () => {
  it("accepts a valid recipe and trims texts", () => {
    const r = recipeInputSchema.parse({ ...valid, title: "  Soupe  " });
    expect(r.title).toBe("Soupe");
  });

  it("rejects missing or invalid fields with French messages", () => {
    expect(error({ title: "   " })).toBe("Le titre est obligatoire");
    expect(error({ servings: 0 })).toBe("Au moins 1 portion");
    expect(error({ sourceUrl: "pas une url" })).toBe("URL invalide");
    expect(error({ ingredients: [{ ...valid.ingredients[0], label: "" }] })).toBe("Ingrédient sans nom");
    expect(error({ steps: [{ ...valid.steps[0], text: " " }] })).toBe("Étape vide");
  });

  it("rejects values outside the closed lists and absurd numbers", () => {
    expect(error({ mealType: "brunch" })).not.toBeNull();
    expect(error({ ingredients: [{ ...valid.ingredients[0], unit: "tasse" }] })).not.toBeNull();
    expect(error({ ingredients: [{ ...valid.ingredients[0], aisle: "cave" }] })).not.toBeNull();
    expect(error({ ingredients: [{ ...valid.ingredients[0], quantity: -1 }] })).not.toBeNull();
    expect(error({ steps: [{ ...valid.steps[0], temperature: 900 }] })).not.toBeNull();
    expect(error({ prepMinutes: 1.5 })).not.toBeNull();
    expect(error({ tags: Array(31).fill("x") })).not.toBeNull();
  });

  it("rejects unexpected shapes sent to the server action", () => {
    expect(recipeInputSchema.safeParse(null).success).toBe(false);
    expect(recipeInputSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ ...valid, ingredients: "farine" }).success).toBe(false);
  });
});
