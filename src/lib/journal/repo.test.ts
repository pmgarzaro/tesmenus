import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-journal-"));
const { getDb, schema } = await import("@/db");
const { seedIfEmpty } = await import("@/db/seed");
const j = await import("./repo");
type Owner = import("./repo").Owner;

let me: Owner;
let partner: Owner; // same household
let stranger: Owner; // other household
let recipeId: number;
let foreignRecipeId: number;

const base = { recipeId: null, servings: null, estKcal: null, estProteinG: null, notes: null };

beforeAll(() => {
  const db = getDb();
  const [h1, h2] = ["A", "B"].map((name) => db.insert(schema.households).values({ name }).returning().get().id);
  const user = (householdId: number, email: string) =>
    db.insert(schema.users).values({ householdId, name: email, email, passwordHash: "x" }).returning().get().id;
  me = { userId: user(h1, "me@x"), householdId: h1 };
  partner = { userId: user(h1, "partner@x"), householdId: h1 };
  stranger = { userId: user(h2, "s@x"), householdId: h2 };
  seedIfEmpty(h1);
  seedIfEmpty(h2);
  recipeId = db.select().from(schema.recipes).all().find((r) => r.householdId === h1)!.id;
  foreignRecipeId = db.select().from(schema.recipes).all().find((r) => r.householdId === h2)!.id;
});

describe("food journal", () => {
  it("adds, lists with totals, updates and deletes entries per user", () => {
    const a = j.addLogEntry(me, { ...base, date: "2026-11-05", slot: "dinner", description: "Chili", estKcal: 650, estProteinG: 45 });
    j.addLogEntry(me, { ...base, date: "2026-11-05", slot: "breakfast", description: "1 egg muffin + café au lait", estKcal: 480, estProteinG: 35 });
    j.addLogEntry(me, { ...base, date: "2026-11-05", slot: "snack", description: "Pomme" });
    j.addLogEntry(me, { ...base, date: "2026-11-06", slot: "lunch", description: "Salade", estKcal: 400, estProteinG: 20.25 });
    j.addLogEntry(partner, { ...base, date: "2026-11-05", slot: "lunch", description: "Pas à moi", estKcal: 999 });

    const day = j.listLog(me, "2026-11-05");
    expect(day.entries.map((e) => e.slot)).toEqual(["breakfast", "snack", "dinner"]);
    expect(day.totals).toEqual([
      { date: "2026-11-05", estKcal: 1130, estProteinG: 80, entries: 3, entriesWithoutEstimate: 1 },
    ]);
    expect(j.listLog(me, "2026-11-05", "2026-11-06").totals.map((t) => t.date)).toEqual(["2026-11-05", "2026-11-06"]);

    const updated = j.updateLogEntry(me, a.id, { estKcal: 700, notes: "grosse portion" });
    expect(updated).toMatchObject({ description: "Chili", estKcal: 700, estProteinG: 45, notes: "grosse portion" });
    expect(j.updateLogEntry(me, a.id, { notes: null }).notes).toBeNull();

    // Someone else's entry is invisible.
    expect(() => j.updateLogEntry(partner, a.id, { estKcal: 1 })).toThrow(j.JournalError);
    expect(j.deleteLogEntry(partner, a.id)).toBe(false);
    expect(j.deleteLogEntry(me, a.id)).toBe(true);
    expect(j.listLog(me, "2026-11-05").entries).toHaveLength(2);
  });

  it("links recipes of the household only, 1 serving by default", () => {
    const e = j.addLogEntry(me, { ...base, date: "2026-11-07", slot: "lunch", description: "Restes", recipeId });
    expect(e).toMatchObject({ recipeId, servings: 1 });
    expect(() =>
      j.addLogEntry(me, { ...base, date: "2026-11-07", slot: "lunch", description: "x", recipeId: foreignRecipeId }),
    ).toThrow(/introuvable/);
    expect(() => j.updateLogEntry(me, e.id, { recipeId: foreignRecipeId })).toThrow(/introuvable/);
  });

  it("rejects invalid input", () => {
    expect(() => j.addLogEntry(me, { ...base, date: "2026-02-30", slot: "lunch", description: "x" })).toThrow(/Date invalide/);
    expect(() => j.addLogEntry(me, { ...base, date: "2026-11-05", slot: "brunch" as never, description: "x" })).toThrow(
      /Créneau inconnu/,
    );
    expect(() => j.addLogEntry(me, { ...base, date: "2026-11-05", slot: "lunch", description: "  " })).toThrow();
    expect(() => j.addLogEntry(me, { ...base, date: "2026-11-05", slot: "lunch", description: "x", estKcal: -5 })).toThrow();
    expect(() => j.listLog(me, "2026-11-06", "2026-11-05")).toThrow(/postérieure/);
    expect(() => j.listLog(me, "2026-01-01", "2026-12-31")).toThrow(/92 jours/);
  });

  it("totals ignore missing estimates per field", () => {
    expect(
      j.totalsByDate([
        { date: "2026-11-02", estKcal: 100.4, estProteinG: null },
        { date: "2026-11-01", estKcal: null, estProteinG: 10.04 },
        { date: "2026-11-02", estKcal: 200, estProteinG: 5 },
      ]),
    ).toEqual([
      { date: "2026-11-01", estKcal: 0, estProteinG: 10, entries: 1, entriesWithoutEstimate: 1 },
      { date: "2026-11-02", estKcal: 300, estProteinG: 5, entries: 2, entriesWithoutEstimate: 1 },
    ]);
  });

  it("nutrition targets: defaults, then per user", () => {
    expect(j.getTargets(me)).toMatchObject({ kcalPerDay: 2170, proteinG: 140, isDefault: true });
    j.setTargets(me, { kcalPerDay: 2100, proteinG: 140, notes: "85 kg" });
    j.setTargets(me, { kcalPerDay: 2050, proteinG: 150, notes: null });
    expect(j.getTargets(me)).toEqual({ kcalPerDay: 2050, proteinG: 150, notes: null, isDefault: false });
    expect(j.getTargets(stranger).isDefault).toBe(true);
    expect(() => j.setTargets(me, { kcalPerDay: 100, proteinG: 140, notes: null })).toThrow();
  });
});
