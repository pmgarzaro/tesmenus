import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-tpl-"));
const { getDb, schema } = await import("@/db");
const { seedIfEmpty } = await import("@/db/seed");
const plans = await import("./repo");
const tpl = await import("./templates");
const { deleteRecipe } = await import("@/lib/recipes/repo");

let h: number;
let other: number;

beforeAll(() => {
  [h, other] = ["A", "B"].map((name) => getDb().insert(schema.households).values({ name }).returning().get().id);
  seedIfEmpty(h);
});

const shape = (p: NonNullable<ReturnType<typeof plans.getPlan>>) =>
  p.entries.map((e) => ({
    slot: e.slot,
    recipeId: e.recipeId,
    servings: e.servings,
    isLeftover: e.isLeftover,
    isEatingOut: e.isEatingOut,
    recipe: e.recipe?.id ?? null,
  }));

describe("plan templates", () => {
  it("saves a plan and replays it at another date", () => {
    const { id } = plans.createPlan(h, { startDate: "2026-10-05", days: 4, slots: ["midi", "soir"], constraints: {} });
    let p = plans.getPlan(h, id)!;
    plans.setEatingOut(h, p.entries.find((e) => e.date === "2026-10-07" && e.slot === "soir")!.id);
    p = plans.getPlan(h, id)!;

    expect(tpl.saveTemplate(other, id, "x")).toBeNull();
    const t = tpl.saveTemplate(h, id, "Semaine type")!;
    const [listed] = tpl.listTemplates(h);
    expect(listed).toMatchObject({ id: t, name: "Semaine type", days: 4 });
    expect(listed.dishes.length).toBeGreaterThan(0);
    expect(tpl.listTemplates(other)).toEqual([]);

    expect(tpl.createPlanFromTemplate(other, t, "2026-11-02")).toBeNull();
    const copy = tpl.createPlanFromTemplate(h, t, "2026-11-02")!;
    expect(copy.warnings).toEqual([]);
    const q = plans.getPlan(h, copy.id)!;
    expect(q.startDate).toBe("2026-11-02");
    expect(shape(q)).toEqual(shape(p));
    // Leftovers point to the copied dinner, not the old one.
    const lunch = q.entries.find((e) => e.date === "2026-11-03" && e.slot === "midi")!;
    expect(lunch.source?.date).toBe("2026-11-02");
  });

  it("leaves meals of deleted recipes empty, with their leftovers", () => {
    const [t] = tpl.listTemplates(h);
    const p = plans.getPlan(h, tpl.createPlanFromTemplate(h, t.id, "2026-12-07")!.id)!;
    const dinner = p.entries.find((e) => e.date === "2026-12-07" && e.slot === "soir")!;
    deleteRecipe(h, dinner.recipeId!);
    const again = tpl.createPlanFromTemplate(h, t.id, "2026-12-14")!;
    expect(again.warnings[0]).toMatch(/n'existe/);
    const q = plans.getPlan(h, again.id)!;
    expect(q.entries.find((e) => e.date === "2026-12-14" && e.slot === "soir")).toMatchObject({ recipeId: null, isLeftover: false });
    expect(q.entries.find((e) => e.date === "2026-12-15" && e.slot === "midi")).toMatchObject({ recipeId: null, isLeftover: false });
  });

  it("renames and deletes", () => {
    const [t] = tpl.listTemplates(h);
    expect(tpl.renameTemplate(other, t.id, "x")).toBe(false);
    expect(tpl.renameTemplate(h, t.id, "Hiver")).toBe(true);
    expect(tpl.deleteTemplate(other, t.id)).toBe(false);
    expect(tpl.deleteTemplate(h, t.id)).toBe(true);
    expect(tpl.listTemplates(h)).toEqual([]);
  });
});
