import { describe, expect, it } from "vitest";
import { addDays, dateRange, defaultStartDate, isValidDate, shortDate } from "./dates";
import { type PlanOptions, type PlannerRecipe, cellKey, generatePlan, layout, proteinOf } from "./generate";

const R = (id: number, tags: string[], totalMinutes = 40, extra: Partial<PlannerRecipe> = {}): PlannerRecipe => ({
  id, title: `R${id}`, tags, mealType: "plat", totalMinutes, freezable: false, ingredientNames: [], ...extra,
});

const LIBRARY: PlannerRecipe[] = [
  R(1, ["viande"], 80), R(2, ["viande"], 60), R(3, ["viande"], 25),
  R(4, ["poisson"], 25), R(5, ["poisson"], 35),
  R(6, ["végé"], 40), R(7, ["végé"], 20), R(8, ["végé"], 70),
  R(9, ["végé"], 0), R(10, ["dessert"], 30, { mealType: "dessert" }),
];

const BASE: PlanOptions = {
  startDate: "2026-10-05", // Monday
  days: 5,
  slots: ["midi", "soir"],
  people: 2,
  servingsPerRecipe: 4,
  dinnerCoversNextLunch: true,
  seed: 42,
};

const cooked = (p: ReturnType<typeof generatePlan>) => p.entries.filter((e) => !e.isLeftover && e.recipeId !== null);

describe("dates", () => {
  it("adds days across months and formats in French", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(dateRange("2026-12-30", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(shortDate("2026-10-05")).toBe("lun. 5 oct.");
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(defaultStartDate("2026-10-02")).toBe("2026-10-05"); // Friday → Monday
    expect(defaultStartDate("2026-10-07")).toBe("2026-10-07"); // Wednesday → today
  });
});

describe("layout", () => {
  it("cooks the first lunch and every dinner; other lunches are leftovers", () => {
    const { cooks, leftovers } = layout(BASE);
    expect(cooks.map((c) => c.key)).toEqual([
      "2026-10-05|midi", "2026-10-05|soir", "2026-10-06|soir", "2026-10-07|soir", "2026-10-08|soir", "2026-10-09|soir",
    ]);
    expect(cooks[0].servings).toBe(2); // first lunch: no leftovers to make
    expect(cooks[1].servings).toBe(4);
    expect(cooks.at(-1)!.servings).toBe(2); // last dinner: leftovers would fall outside the plan
    expect(leftovers.get("2026-10-06|midi")).toBe("2026-10-05|soir");
  });

  it("cooks every meal without the leftover rule", () => {
    const { cooks, leftovers } = layout({ ...BASE, dinnerCoversNextLunch: false });
    expect(cooks).toHaveLength(10);
    expect(leftovers.size).toBe(0);
    expect(cooks.every((c) => c.servings === 2)).toBe(true);
  });
});

describe("generatePlan", () => {
  it("is deterministic for a seed and differs with another seed", () => {
    const a = generatePlan(BASE, LIBRARY);
    expect(generatePlan(BASE, LIBRARY)).toEqual(a);
    const ids = (p: typeof a) => cooked(p).map((e) => e.recipeId).join();
    const seeds = new Set([1, 2, 3, 4, 5].map((seed) => ids(generatePlan({ ...BASE, seed }, LIBRARY))));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("fills every meal, without repeats, without desserts", () => {
    const p = generatePlan(BASE, LIBRARY);
    expect(p.entries).toHaveLength(10);
    const ids = cooked(p).map((e) => e.recipeId);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids).not.toContain(10);
    expect(p.warnings).toEqual([]);
  });

  it("links leftover lunches to the previous dinner", () => {
    const p = generatePlan(BASE, LIBRARY);
    const lunch = p.entries.find((e) => e.date === "2026-10-07" && e.slot === "midi")!;
    expect(lunch).toMatchObject({ isLeftover: true, recipeId: null, sourceKey: cellKey("2026-10-06", "soir") });
  });

  it("alternates protein families", () => {
    for (const seed of [1, 7, 42, 99]) {
      const fams = cooked(generatePlan({ ...BASE, seed }, LIBRARY)).map((e) => proteinOf(LIBRARY.find((r) => r.id === e.recipeId)!));
      const consecutive = fams.filter((f, i) => i > 0 && f === fams[i - 1]).length;
      expect(consecutive).toBeLessThanOrEqual(1);
      expect(new Set(fams).size).toBe(3);
    }
  });

  it("respects a max time on a day, including unknown durations", () => {
    const max = { "2026-10-06": 30 };
    for (const seed of [1, 2, 3]) {
      const p = generatePlan({ ...BASE, seed, constraints: { maxMinutesByDate: max } }, LIBRARY);
      const tuesday = p.entries.find((e) => e.date === "2026-10-06" && e.slot === "soir")!;
      const r = LIBRARY.find((x) => x.id === tuesday.recipeId)!;
      expect(r.totalMinutes).toBeGreaterThan(0);
      expect(r.totalMinutes).toBeLessThanOrEqual(30);
    }
  });

  it("includes requested recipes and honours only-freezable / excluded tags", () => {
    const p = generatePlan({ ...BASE, constraints: { include: [8, 1] } }, LIBRARY);
    expect(cooked(p).map((e) => e.recipeId)).toEqual(expect.arrayContaining([8, 1]));

    const lib = LIBRARY.map((r) => ({ ...r, freezable: r.id % 2 === 0 }));
    const f = generatePlan({ ...BASE, days: 2, constraints: { onlyFreezable: true } }, lib);
    expect(cooked(f).every((e) => e.recipeId! % 2 === 0)).toBe(true);

    const noFish = generatePlan({ ...BASE, constraints: { excludeTags: ["poisson"] } }, LIBRARY);
    expect(cooked(noFish).map((e) => e.recipeId)).not.toEqual(expect.arrayContaining([4]));
    expect(cooked(noFish).some((e) => e.recipeId === 4 || e.recipeId === 5)).toBe(false);
  });

  it("avoids last week's recipes when it can", () => {
    const recent = [1, 2, 4];
    const p = generatePlan({ ...BASE, days: 3, recentRecipeIds: recent }, LIBRARY);
    expect(cooked(p).some((e) => recent.includes(e.recipeId!))).toBe(false);
  });

  it("prefers recipes sharing ingredients", () => {
    const lib = [
      R(1, ["végé"], 30, { ingredientNames: ["courgette", "feta", "sel"] }),
      R(2, ["végé"], 30, { ingredientNames: ["courgette", "feta"] }),
      R(3, ["végé"], 30, { ingredientNames: ["chou", "lardons"] }),
      R(4, ["végé"], 30, { ingredientNames: ["navet"] }),
    ];
    let together = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const two = cooked(generatePlan({ ...BASE, days: 2, slots: ["soir"], dinnerCoversNextLunch: false, seed, constraints: { include: [1] } }, lib)).map((e) => e.recipeId);
      if (two.includes(2)) together++;
    }
    expect(together).toBeGreaterThan(12);
  });

  it("keeps fixed cells and avoids the replaced recipe (reroll)", () => {
    const p = generatePlan(BASE, LIBRARY);
    const fixed = Object.fromEntries(cooked(p).slice(1).map((e) => [cellKey(e.date, e.slot), e.recipeId]));
    const first = cooked(p)[0];
    const reroll = generatePlan({ ...BASE, seed: 7, fixed, avoid: [first.recipeId!] }, LIBRARY);
    expect(cooked(reroll).slice(1)).toEqual(cooked(p).slice(1));
    expect(cooked(reroll)[0].recipeId).not.toBe(first.recipeId);
  });

  it("repeats rather than leaving meals empty, and warns when impossible", () => {
    const small = [R(1, ["viande"]), R(2, ["végé"])];
    const p = generatePlan(BASE, small);
    expect(cooked(p)).toHaveLength(6);
    const none = generatePlan({ ...BASE, constraints: { maxMinutesByDate: { "2026-10-05": 5 } } }, small);
    expect(none.warnings.join()).toMatch(/5 min ou moins pour lun\. 5 oct\./);
    expect(generatePlan(BASE, []).warnings[0]).toMatch(/Aucune recette/);
  });
});
