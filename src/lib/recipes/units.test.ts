import { describe, expect, it } from "vitest";
import { formatIngredientLine, formatQuantity, scaleQuantity } from "./units";

describe("scaleQuantity", () => {
  it("scales proportionally", () => {
    expect(scaleQuantity(500, 4, 2)).toBe(250);
    expect(scaleQuantity(3, 6, 4)).toBe(2);
    expect(scaleQuantity(null, 4, 8)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it.each([
    [250, "g", "250 g"],
    [333.33, "g", "330 g"],
    [37.5, "g", "40 g"],
    [2, "piece", "2"],
    [1.5, "piece", "1 ½"],
    [0.5, "piece", "½"],
    [0.333, "cas", "¼ c. à s."],
    [2, "gousse", "2 gousses"],
    [1, "gousse", "1 gousse"],
    [40, "cl", "40 cl"],
    [1.25, "kg", "1 ¼ kg"],
    [null, null, ""],
  ] as const)("%s %s → %s", (q, unit, expected) => {
    expect(formatQuantity(q, unit)).toBe(expected);
  });
});

describe("formatIngredientLine", () => {
  it.each([
    [250, "g", "farine", "250 g de farine"],
    [2, "gousse", "ail", "2 gousses d'ail"],
    [2, "cas", "huile d'olive", "2 c. à s. d'huile d'olive"],
    [2, "piece", "oignons", "2 oignons"],
    [1, "piece", "oignons jaunes", "1 oignon jaune"],
    [0.5, "piece", "citrons", "½ citron"],
    [3, "piece", "citron", "3 citrons"],
    [2, "piece", "pomme de terre", "2 pommes de terre"],
    [2, "piece", "poireau", "2 poireaux"],
    [2, "piece", "poulet fermier (1,5 kg)", "2 poulets fermiers (1,5 kg)"],
    [1, "piece", "œufs", "1 œuf"],
    [null, null, "sel", "sel"],
    [0.5, "boite", "haricots rouges", "½ boîte de haricots rouges"],
    [1, "cas", "huile", "1 c. à s. d'huile"],
  ] as const)("%s %s %s", (q, unit, label, expected) => {
    expect(formatIngredientLine(q, unit, label)).toBe(expected);
  });
});
