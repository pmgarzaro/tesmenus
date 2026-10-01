import { describe, expect, it } from "vitest";
import { SEED_RECIPES } from "@/db/seed-data";
import { type BatchRecipe, type Schedule, missingSteps, scheduleBatch } from "./schedule";

const fromSeed = (title: string, key = title): BatchRecipe => {
  const r = SEED_RECIPES.find((x) => x.title === title)!;
  return {
    key,
    title,
    steps: r.steps.map(([text, durationMinutes, type, equipment, temperature]) => ({ text, durationMinutes, type, equipment, temperature })),
  };
};

/** Invariants every schedule must satisfy. */
function check(recipes: BatchRecipe[], s: Schedule) {
  expect(missingSteps(recipes, s)).toEqual([]);
  for (const r of recipes) {
    const steps = s.tasks.filter((t) => t.recipeKey === r.key).sort((a, b) => a.stepIndex - b.stepIndex);
    for (let i = 1; i < steps.length; i++) expect(steps[i].start).toBeGreaterThanOrEqual(steps[i - 1].end);
  }
  const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
  const active = s.tasks.filter((t) => t.active && t.end > t.start);
  for (const a of active) for (const b of active) if (a !== b) expect(overlap(a, b), `${a.id} / ${b.id}`).toBe(false);
  // Equipment use at every instant something starts.
  const busyAt = (eq: string, time: number) => s.tasks.filter((t) => t.equipment === eq && t.start <= time && time < t.end);
  for (const time of new Set(s.tasks.map((t) => t.start))) {
    const oven = busyAt("four", time);
    expect(oven.length).toBeLessThanOrEqual(2);
    expect(new Set(oven.map((t) => t.temperature).filter(Boolean)).size).toBeLessThanOrEqual(1);
    expect(busyAt("plaque", time).length).toBeLessThanOrEqual(3);
  }
  expect(s.totalMinutes).toBe(Math.max(...s.tasks.map((t) => t.end)));
}

describe("scheduleBatch", () => {
  it("runs the oven while the cook prepares the other dishes", () => {
    const recipes = ["Gratin dauphinois", "Chili con carne", "Curry de pois chiches"].map((t) => fromSeed(t));
    const s = scheduleBatch(recipes);
    check(recipes, s);
    expect(s.totalMinutes).toBeLessThan(s.separateMinutes * 0.7);
    // The long oven cooking starts before the chili is done being prepared.
    const gratinOven = s.tasks.find((t) => t.recipeKey === "Gratin dauphinois" && t.text.startsWith("Enfourner"))!;
    const chiliEnd = Math.max(...s.tasks.filter((t) => t.recipeKey === "Chili con carne").map((t) => t.end));
    expect(gratinOven.start).toBeLessThan(chiliEnd);
  });

  it("shares a hot oven between dishes at the same temperature", () => {
    const recipes = [fromSeed("Saumon au four et brocolis"), fromSeed("Poulet rôti aux légumes")]; // both 200 °C
    const s = scheduleBatch(recipes);
    check(recipes, s);
    expect(s.tasks.filter((t) => t.merged)).toHaveLength(1);
  });

  it("never mixes oven temperatures, and does not waste a preheat", () => {
    const recipes = ["Gratin dauphinois", "Poulet rôti aux légumes", "Quiche poireaux et chèvre"].map((t) => fromSeed(t)); // 180 / 200 / 180
    const s = scheduleBatch(recipes);
    check(recipes, s);
    // Every non-skipped preheat is followed by its dish going in at that temperature
    // before the oven changes temperature.
    const ovenSteps = s.tasks.filter((t) => t.equipment === "four" && t.end > t.start).sort((a, b) => a.start - b.start);
    for (const pre of ovenSteps.filter((t) => /Préchauffer/.test(t.text))) {
      const cook = s.tasks.find((t) => t.recipeKey === pre.recipeKey && t.equipment === "four" && !/Préchauffer/.test(t.text))!;
      const otherTemp = ovenSteps.filter((t) => t.temperature !== pre.temperature && t.start >= pre.start && t.start < cook.start);
      expect(otherTemp, pre.id).toEqual([]);
    }
    // Both 180 °C dishes share one preheat.
    expect(s.tasks.filter((t) => t.merged).length).toBeGreaterThanOrEqual(1);
  });

  it("handles the whole sample library and the same recipe twice", () => {
    const all = SEED_RECIPES.map((r) => fromSeed(r.title));
    check(all, scheduleBatch(all));
    const twice = [fromSeed("Soupe de lentilles corail", "a"), fromSeed("Soupe de lentilles corail", "b")];
    check(twice, scheduleBatch(twice));
  });

  it("uses default durations when missing and flags them", () => {
    const r: BatchRecipe = {
      key: "x",
      title: "X",
      steps: [
        { text: "Couper les légumes", durationMinutes: null, type: "preparation", equipment: null, temperature: null },
        { text: "Laisser mijoter", durationMinutes: null, type: "cuisson", equipment: "plaque", temperature: null },
      ],
    };
    const s = scheduleBatch([r]);
    check([r], s);
    expect(s.tasks.map((t) => [t.end - t.start, t.estimated])).toEqual([[10, true], [15, true]]);
  });

  it("cuts vegetables before raw meat when both are equally urgent", () => {
    const meat: BatchRecipe = { key: "m", title: "M", steps: [{ text: "Couper le poulet en morceaux", durationMinutes: 10, type: "preparation", equipment: null, temperature: null }] };
    const veg: BatchRecipe = { key: "v", title: "V", steps: [{ text: "Couper les courgettes", durationMinutes: 10, type: "preparation", equipment: null, temperature: null }] };
    const s = scheduleBatch([meat, veg]);
    expect(s.tasks.map((t) => t.recipeKey)).toEqual(["v", "m"]);
  });
});
