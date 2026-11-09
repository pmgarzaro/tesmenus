import { describe, expect, it } from "vitest";
import type { Amount } from "./aggregate";
import { coverFromStock, formatAmounts } from "./stock";

const item = (name: string, ...amounts: Amount[]) => ({ name, amounts, unquantified: amounts.length === 0 });

describe("shopping list minus the stock", () => {
  it("ignores lines with nothing in stock", () => {
    expect(coverFromStock(item("oignon", { quantity: 2, unit: "piece" }), [{ name: "Yaourts", quantity: "4" }])).toBeNull();
  });

  it("strikes a line when there is enough, converting units", () => {
    const c = coverFromStock(item("crème fraîche", { quantity: 300, unit: "ml" }), [
      { name: "Crème fraîche", quantity: "20 cl" },
      { name: "crème fraîche", quantity: "10 cl" },
    ]);
    expect(c).toMatchObject({ covered: true, toBuy: [], unsure: false, have: ["Crème fraîche (20 cl)", "crème fraîche (10 cl)"] });
    expect(coverFromStock(item("sel"), [{ name: "Sel", quantity: null }])).toMatchObject({ covered: true });
    // A crumb short counts as enough.
    expect(coverFromStock(item("riz", { quantity: 1020, unit: "g" }), [{ name: "Riz", quantity: "1 kg" }])).toMatchObject({ covered: true });
  });

  it("buys only what is missing", () => {
    const c = coverFromStock(item("courgette", { quantity: 5, unit: "piece" }), [{ name: "Courgettes", quantity: "3" }])!;
    expect(c).toMatchObject({ covered: false, unsure: false });
    expect(formatAmounts(c.toBuy)).toBe("2");
    const butter = coverFromStock(item("beurre", { quantity: 250, unit: "g" }), [{ name: "Beurre", quantity: "2 c. à soupe" }])!;
    expect(formatAmounts(butter.toBuy)).toBe("220 g");
  });

  it("keeps the full amount, marked unsure, when the stock cannot be compared", () => {
    expect(coverFromStock(item("crème fraîche", { quantity: 200, unit: "ml" }), [{ name: "Crème fraîche", quantity: "un fond" }])).toMatchObject({
      covered: false,
      unsure: true,
      toBuy: [{ quantity: 200, unit: "ml" }],
    });
    expect(coverFromStock(item("tomate pelée", { quantity: 400, unit: "g" }), [{ name: "Tomates pelées", quantity: "2 boîtes" }])).toMatchObject({
      covered: false,
      unsure: true,
    });
    expect(coverFromStock(item("lait", { quantity: 50, unit: "cl" }), [{ name: "Lait", quantity: null }])).toMatchObject({ unsure: true });
  });
});
