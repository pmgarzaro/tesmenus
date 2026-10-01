import { describe, expect, it } from "vitest";
import { guessStep, splitSteps } from "./steps";

describe("guessStep", () => {
  it.each([
    ["Préchauffer le four à 180 °C.", { type: "preparation", equipment: "four", temperature: 180 }],
    ["Enfourner 45 min à th. 6", { type: "cuisson", equipment: "four", temperature: 180, durationMinutes: 45 }],
    ["Émincer les oignons.", { type: "preparation", equipment: null, durationMinutes: null }],
    ["Faire revenir les oignons dans une poêle 5 minutes.", { type: "cuisson", equipment: "plaque", durationMinutes: 5 }],
    ["Laisser mijoter 1 h 30 à feu doux.", { type: "cuisson", equipment: "plaque", durationMinutes: 90 }],
    ["Laisser reposer 2 heures au réfrigérateur.", { type: "repos", durationMinutes: 120 }],
    ["Mixer la soupe.", { type: "preparation", equipment: "mixeur" }],
    ["Cuire 10 à 12 minutes.", { type: "cuisson", durationMinutes: 12 }],
  ] as const)("%s", (text, expected) => {
    expect(guessStep(text)).toMatchObject(expected);
  });
});

describe("splitSteps", () => {
  it("splits lines and strips numbering", () => {
    expect(splitSteps("1. Éplucher.\n2) Couper\n\nÉtape 3 : Cuire\n- Servir")).toEqual([
      "Éplucher.",
      "Couper",
      "Cuire",
      "Servir",
    ]);
  });
});
