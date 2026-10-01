import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { RecipeInput } from "./input";

// Real SQLite database in a temp dir (paths are read at import time).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-test-"));
const { getDb, schema } = await import("@/db");
const repo = await import("./repo");
const { seedIfEmpty } = await import("@/db/seed");

let h1: number;
let h2: number;

const input = (over: Partial<RecipeInput> = {}): RecipeInput => ({
  title: "Soupe",
  description: null,
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  mealType: "plat",
  tags: ["Végé", "soupe", "végé"],
  sourceUrl: null,
  notes: null,
  fridgeDays: 3,
  freezable: true,
  ingredients: [
    { quantity: 2, unit: "piece", label: "oignons jaunes", aisle: null, optional: false },
    { quantity: 500, unit: "g", label: "carottes", aisle: null, optional: false },
  ],
  steps: [
    { text: "Émincer", durationMinutes: 5, type: "preparation", equipment: null, temperature: null },
  ],
  ...over,
});

beforeAll(() => {
  const db = getDb();
  [h1, h2] = ["A", "B"].map(
    (name) => db.insert(schema.households).values({ name }).returning().get().id,
  );
});

describe("recipe repository", () => {
  it("creates a recipe with normalised ingredients and tags", () => {
    const id = repo.createRecipe(h1, input());
    const r = repo.getRecipe(h1, id)!;
    expect(r.tags).toEqual(["végé", "soupe"]);
    expect(r.ingredients.map((i) => [i.label, i.name, i.aisle])).toEqual([
      ["oignons jaunes", "oignon", "fruits-legumes"],
      ["carottes", "carotte", "fruits-legumes"],
    ]);
    expect(r.steps).toHaveLength(1);
  });

  it("reuses an ingredient across recipes and keeps households apart", () => {
    repo.createRecipe(h1, input({
      title: "Tarte",
      ingredients: [{ quantity: 1, unit: "piece", label: "Oignon", aisle: null, optional: false }],
    }));
    repo.createRecipe(h2, input({ title: "Autre foyer" }));
    const names = (h: number) =>
      getDb().select().from(schema.ingredients).all().filter((i) => i.householdId === h).map((i) => i.name);
    expect(names(h1).filter((n) => n === "oignon")).toHaveLength(1);
    expect(names(h2)).toContain("oignon");
    expect(repo.listRecipeSummaries(h1).map((r) => r.title)).toEqual(["Soupe", "Tarte"]);
    expect(repo.listRecipeSummaries(h2).map((r) => r.title)).toEqual(["Autre foyer"]);
  });

  it("updates, including a manual aisle change", () => {
    const id = repo.createRecipe(h1, input({ title: "Avant" }));
    const ok = repo.updateRecipe(h1, id, input({
      title: "Après",
      ingredients: [{ quantity: 1, unit: "boite", label: "lait de coco", aisle: "epicerie", optional: true }],
      steps: [],
    }));
    expect(ok).toBe(true);
    const r = repo.getRecipe(h1, id)!;
    expect(r.title).toBe("Après");
    expect(r.ingredients).toMatchObject([{ name: "lait de coco", aisle: "epicerie", optional: true }]);
    expect(r.steps).toEqual([]);
    expect(repo.toInput(r).ingredients[0].label).toBe("lait de coco");
  });

  it("refuses to touch another household's recipe", () => {
    const id = repo.createRecipe(h1, input({ title: "Privée" }));
    expect(repo.getRecipe(h2, id)).toBeNull();
    expect(repo.updateRecipe(h2, id, input({ title: "Piratée" }))).toBe(false);
    expect(repo.deleteRecipe(h2, id)).toBe(false);
    expect(repo.getRecipe(h1, id)!.title).toBe("Privée");
    expect(repo.deleteRecipe(h1, id)).toBe(true);
    expect(repo.getRecipe(h1, id)).toBeNull();
  });

  it("seeds sample recipes with labels free of quantities", () => {
    const h3 = getDb().insert(schema.households).values({ name: "C" }).returning().get().id;
    expect(seedIfEmpty(h3)).toBe(8);
    expect(seedIfEmpty(h3)).toBe(0);
    const chili = repo.listRecipeSummaries(h3).find((r) => r.title === "Chili con carne")!;
    const labels = repo.getRecipe(h3, chili.id)!.ingredients.map((i) => i.label);
    expect(labels).toContain("bœuf haché");
    expect(labels.every((l) => !/^\d/.test(l))).toBe(true);
  });
});
