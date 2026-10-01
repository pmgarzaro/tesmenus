import { describe, expect, it } from "vitest";
import {
  guessAisle,
  ingredientKey,
  normalizeIngredientName,
  normalizeTags,
  parseIngredientLine,
  parseQuantity,
} from "./normalize";

describe("normalizeIngredientName", () => {
  it.each([
    ["Oignons jaunes", "oignon"],
    ["oignons jaunes émincés", "oignon"],
    ["Gousses d'ail", "ail"],
    ["carottes coupées en rondelles", "carotte"],
    ["poireaux", "poireau"],
    ["pois chiches", "pois chiches"],
    ["petits pois", "petits pois"],
    ["noix", "noix"],
    ["Huile d'olive vierge extra", "huile d'olive"],
    ["beurre (doux), à température ambiante", "beurre"],
    ["œufs", "œuf"],
    ["oeufs", "œuf"],
    ["tomates concassées", "tomates concassées"],
    ["du riz basmati", "riz basmati"],
    ["beurre ou margarine", "beurre"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeIngredientName(raw)).toBe(expected);
  });

  it("gives the same key to variants", () => {
    expect(ingredientKey("Bœuf haché")).toBe(ingredientKey("boeuf haché"));
    expect(ingredientKey("Épinards frais")).not.toBe(ingredientKey("épinards"));
    expect(ingredientKey("épinard")).toBe(ingredientKey("Épinards"));
  });
});

describe("guessAisle", () => {
  it.each([
    ["oignon", "fruits-legumes"],
    ["ail", "fruits-legumes"],
    ["pavé de saumon", "poissonnerie"],
    ["bœuf haché", "boucherie"],
    ["blanc de poulet", "boucherie"],
    ["crème liquide", "cremerie"],
    ["œuf", "cremerie"],
    ["pâte brisée", "cremerie"],
    ["épinards surgelés", "surgeles"],
    ["farine", "epicerie"],
    ["lait de coco", "cremerie"],
    ["baguette", "boulangerie"],
  ])("%s → %s", (name, aisle) => {
    expect(guessAisle(name)).toBe(aisle);
  });
});

describe("parseQuantity", () => {
  it.each([
    ["2", 2],
    ["1,5", 1.5],
    ["1/2", 0.5],
    ["1 1/2", 1.5],
    ["½", 0.5],
    ["1½", 1.5],
    ["2-3", 2.5],
    ["", null],
    ["abc", null],
  ])("%s → %s", (raw, q) => {
    expect(parseQuantity(raw)).toBe(q);
  });
});

describe("parseIngredientLine", () => {
  it.each([
    ["200 g de farine", 200, "g", "farine", "farine"],
    ["200g farine", 200, "g", "farine", "farine"],
    ["1 kg de pommes de terre", 1, "kg", "pommes de terre", "pomme de terre"],
    ["2 oignons jaunes", 2, "piece", "oignons jaunes", "oignon"],
    ["3 gousses d'ail", 3, "gousse", "ail", "ail"],
    ["2 c. à s. d'huile d'olive", 2, "cas", "huile d'olive", "huile d'olive"],
    ["1 cuillère à café de cumin", 1, "cac", "cumin", "cumin"],
    ["1 càc de sel", 1, "cac", "sel", "sel"],
    ["25 cl de crème liquide", 25, "cl", "crème liquide", "crème liquide"],
    ["1/2 citron", 0.5, "piece", "citron", "citron"],
    ["1 boîte de haricots rouges (400 g)", 1, "boite", "haricots rouges (400 g)", "haricots rouges"],
    ["20 g de gingembre", 20, "g", "gingembre", "gingembre"],
    ["20 c) de lait", 20, "cl", "lait", "lait"],
    ["2 citrons", 2, "piece", "citrons", "citron"],
    ["- 1 pincée de sel", 1, "pincee", "sel", "sel"],
    ["Sel, poivre", null, null, "Sel, poivre", "sel"],
  ])("%s", (line, quantity, unit, label, name) => {
    const p = parseIngredientLine(line);
    expect(p).toMatchObject({ quantity, unit, label, name });
  });

  it("detects optional ingredients", () => {
    expect(parseIngredientLine("1 botte de coriandre (facultatif)")).toMatchObject({
      quantity: 1,
      unit: "botte",
      name: "coriandre",
      optional: true,
    });
  });
});

describe("normalizeTags", () => {
  it("lowercases, trims and dedupes", () => {
    expect(normalizeTags([" Végé", "#rapide", "végé", ""])).toEqual(["végé", "rapide"]);
  });
});
