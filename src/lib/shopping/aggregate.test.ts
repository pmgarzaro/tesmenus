import { describe, expect, it } from "vitest";
import { type NeedLine, aggregate, formatAmount, formatItemAmounts, toText } from "./aggregate";

let n = 0;
const L = (name: string, quantity: number | null, unit: NeedLine["unit"], extra: Partial<NeedLine> = {}): NeedLine => ({
  ingredientId: extra.ingredientId ?? name.length * 1000 + name.charCodeAt(0),
  name,
  aisle: "epicerie",
  quantity,
  unit,
  optional: false,
  recipe: `R${++n}`,
  ...extra,
});

const one = (lines: NeedLine[]) => {
  const items = aggregate(lines);
  expect(items).toHaveLength(1);
  return items[0];
};

describe("aggregate", () => {
  it("adds masses and volumes across units", () => {
    expect(formatItemAmounts(one([L("farine", 250, "g"), L("farine", 1, "kg")]))).toBe("1,3 kg");
    expect(formatItemAmounts(one([L("lait", 25, "cl"), L("lait", 200, "ml"), L("lait", 1, "l")]))).toBe("1,5 l");
    expect(formatItemAmounts(one([L("crème liquide", 20, "cl"), L("crème liquide", 20, "cl")]))).toBe("40 cl");
  });

  it("converts spoons to grams for common ingredients", () => {
    const sugar = one([L("sucre", 100, "g"), L("sucre", 2, "cas"), L("sucre", 3, "cac")]);
    expect(sugar.amounts).toEqual([{ quantity: 145, unit: "g" }]);
    expect(formatItemAmounts(one([L("beurre", 2, "cas")]))).toBe("30 g");
  });

  it("converts spoons to ml when the ingredient is also measured by volume", () => {
    expect(formatItemAmounts(one([L("huile d'olive", 10, "cl"), L("huile d'olive", 2, "cas")]))).toBe("13 cl");
  });

  it("buys liquids by volume", () => {
    expect(formatItemAmounts(one([L("huile d'olive", 2, "cas"), L("huile d'olive", 3, "cas"), L("huile d'olive", 1, "cac")]))).toBe("8 cl");
    expect(formatItemAmounts(one([L("sauce soja", 1, "cas")]))).toBe("2 cl");
  });

  it("keeps spoons when nothing else is known", () => {
    expect(formatItemAmounts(one([L("cumin", 1, "cac"), L("cumin", 1, "cas")]))).toBe("1 ½ c. à s.");
    expect(formatItemAmounts(one([L("cumin", 1, "cac"), L("cumin", 1, "cac")]))).toBe("2 c. à c.");
  });

  it("keeps separate lines for units that cannot be converted", () => {
    const tomato = one([L("tomates concassées", 400, "g"), L("tomates concassées", 1, "boite"), L("tomates concassées", 1, "boite")]);
    expect(formatItemAmounts(tomato)).toBe("400 g + 2 boîtes");
  });

  it("rounds countable things up and ignores pinches", () => {
    expect(formatItemAmounts(one([L("oignon", 1.5, "piece"), L("oignon", 1, "piece")]))).toBe("3");
    const salt = one([L("sel", 1, "pincee"), L("sel", null, null)]);
    expect(salt).toMatchObject({ amounts: [], unquantified: true });
    expect(formatItemAmounts(one([L("ail", 2, "gousse"), L("ail", 1, "gousse")]))).toBe("3 gousses");
  });

  it("tracks recipes and optional ingredients, sorts by aisle", () => {
    const items = aggregate([
      L("coriandre", 1, "botte", { optional: true, aisle: "fruits-legumes", recipe: "Curry" }),
      L("riz", 300, "g", { recipe: "Curry" }),
      L("riz", 200, "g", { optional: true, recipe: "Chili" }),
      L("poulet", 1, "piece", { aisle: "boucherie", recipe: "Poulet rôti" }),
    ]);
    expect(items.map((i) => i.name)).toEqual(["coriandre", "poulet", "riz"]);
    expect(items[0].optional).toBe(true);
    expect(items[2]).toMatchObject({ optional: false, recipes: ["Curry", "Chili"] });
  });
});

describe("formatAmount", () => {
  it.each([
    [{ quantity: 333, unit: "g" }, "340 g"],
    [{ quantity: 42, unit: "g" }, "45 g"],
    [{ quantity: 1000, unit: "g" }, "1 kg"],
    [{ quantity: 5, unit: "ml" }, "5 ml"],
    [{ quantity: 125, unit: "ml" }, "13 cl"],
    [{ quantity: 2.2, unit: "piece" }, "3"],
    [{ quantity: 1, unit: "botte" }, "1 botte"],
  ] as const)("%o → %s", (a, s) => expect(formatAmount(a)).toBe(s));
});

describe("toText", () => {
  it("groups by aisle", () => {
    expect(
      toText({
        title: "Courses du 5 octobre",
        items: [
          { name: "riz", amount: "500 g", aisle: "epicerie" },
          { name: "oignon", amount: "3", aisle: "fruits-legumes" },
          { name: "piles", amount: "", aisle: "autre" },
        ],
      }),
    ).toBe("Courses du 5 octobre\n\nFruits & légumes\n- Oignon : 3\n\nÉpicerie\n- Riz : 500 g\n\nAutre\n- Piles");
  });
});
