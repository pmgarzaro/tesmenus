import { describe, expect, it } from "vitest";
import { type FridgeRecipe, matchFridge } from "./fridge";

const R = (id: number, title: string, names: string[], optional: string[] = [], minutes = 30): FridgeRecipe => ({
  id,
  title,
  minutes,
  ingredients: [...names.map((name) => ({ name, optional: false })), ...optional.map((name) => ({ name, optional: true }))],
});

const recipes = [
  R(1, "Omelette", ["œuf", "sel", "beurre"], ["ciboulette"], 10),
  R(2, "Poulet curry", ["blanc de poulet", "lait de coco", "curry", "oignon", "riz basmati"], [], 40),
  R(3, "Quiche", ["pâte brisée", "œuf", "crème liquide", "lardons"], [], 45),
  R(4, "Salade", ["tomate", "mozzarella"]),
];

describe("matchFridge", () => {
  it("ranks recipes by share of ingredients owned, ignoring basics and optional ones", () => {
    const res = matchFridge(recipes, ["Oeufs", "beurre"]);
    expect(res.map((r) => [r.title, r.score])).toEqual([["Omelette", 100], ["Quiche", 25]]);
    expect(res[0].missing).toEqual([]);
    expect(res[1].missing).toEqual(["pâte brisée", "crème liquide", "lardons"]);
  });

  it("matches broader names and plurals", () => {
    const res = matchFridge(recipes, ["poulet", "oignons", "riz basmati", "curry", "lait de coco"]);
    expect(res[0]).toMatchObject({ title: "Poulet curry", score: 100 });
  });

  it("uses the household pantry and returns nothing without ingredients", () => {
    expect(matchFridge(recipes, ["œuf"], ["beurre"])[0]).toMatchObject({ title: "Omelette", score: 100 });
    expect(matchFridge(recipes, [])).toEqual([]);
    expect(matchFridge(recipes, ["chocolat"])).toEqual([]);
  });
});
