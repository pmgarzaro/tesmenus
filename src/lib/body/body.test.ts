import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { summarize, weeklyRate, weightAverages } from "./measures";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-body-"));
const { getDb, schema } = await import("@/db");
const body = await import("./repo");
type Owner = import("@/lib/journal/repo").Owner;

let me: Owner;
let other: Owner;

beforeAll(() => {
  const db = getDb();
  const h = db.insert(schema.households).values({ name: "A" }).returning().get().id;
  const user = (email: string) =>
    db.insert(schema.users).values({ householdId: h, name: email, email, passwordHash: "x" }).returning().get().id;
  me = { userId: user("me@x"), householdId: h };
  other = { userId: user("other@x"), householdId: h };
});

describe("trends", () => {
  it("averages weight over the 7 days ending on each weighing", () => {
    expect(
      weightAverages([
        { date: "2026-11-01", weightKg: 86 },
        { date: "2026-11-03", weightKg: 85 },
        { date: "2026-11-04", waistCm: 95 },
        { date: "2026-11-08", weightKg: 84 }, // 11-01 is out of its window
      ]),
    ).toEqual([
      { date: "2026-11-01", weightKg: 86, avg7: 86 },
      { date: "2026-11-03", weightKg: 85, avg7: 85.5 },
      { date: "2026-11-08", weightKg: 84, avg7: 84.5 },
    ]);
  });

  it("computes a weekly rate by regression, only over a week or more", () => {
    const pts = [0, 7, 14, 21].map((d, i) => ({ date: `2026-10-${String(1 + d).padStart(2, "0")}`, value: 90 - 0.5 * i }));
    expect(weeklyRate(pts)).toBe(-0.5);
    expect(weeklyRate(pts.slice(0, 1))).toBeNull();
    expect(weeklyRate([{ date: "2026-10-01", value: 90 }, { date: "2026-10-03", value: 89 }])).toBeNull();
  });

  it("summarizes each measure", () => {
    const s = summarize([
      { date: "2026-10-01", weightKg: 90, waistCm: 100 },
      { date: "2026-10-15", weightKg: 89 },
      { date: "2026-10-29", weightKg: 88, waistCm: 97.5 },
    ]);
    expect(s.weightKg).toMatchObject({ first: { value: 90 }, last: { value: 88 }, change: -2, ratePerWeek: -0.5 });
    expect(s.waistCm).toMatchObject({ change: -2.5 });
    expect(s.hipsCm).toBeUndefined();
  });
});

describe("body log", () => {
  it("keeps one entry per day and merges fields", () => {
    body.saveBodyEntry(me, { date: "2026-11-05", weightKg: 85.4 });
    body.saveBodyEntry(me, { date: "2026-11-05", waistCm: 96 });
    expect(body.getBodyEntry(me, "2026-11-05")).toMatchObject({ weightKg: 85.4, waistCm: 96 });
    body.saveBodyEntry(me, { date: "2026-11-05", weightKg: 85.2, waistCm: null });
    expect(body.getBodyEntry(me, "2026-11-05")).toMatchObject({ weightKg: 85.2, waistCm: null });
    expect(body.getBodyEntry(other, "2026-11-05")).toBeNull();
    expect(getDb().select().from(schema.bodyLog).all()).toHaveLength(1);
  });

  it("validates input", () => {
    expect(() => body.saveBodyEntry(me, { date: "2026-11-06" })).toThrow(/au moins une mesure/);
    expect(() => body.saveBodyEntry(me, { date: "2026-11-06", weightKg: 5 })).toThrow(/Poids/);
    expect(() => body.saveBodyEntry(me, { date: "2026-13-01", weightKg: 80 })).toThrow(/Date invalide/);
  });

  it("lists a period with trends, deletes, and removes emptied days", () => {
    body.saveBodyEntry(me, { date: "2026-10-20", weightKg: 86.5, waistCm: 98 });
    const { entries, weight, summary } = body.listBody(me, "2026-10-01", "2026-11-05");
    expect(entries.map((e) => e.date)).toEqual(["2026-10-20", "2026-11-05"]);
    expect(weight).toHaveLength(2);
    expect(summary.weightKg?.change).toBeCloseTo(-1.3);
    expect(body.latestWeight(me)).toEqual({ date: "2026-11-05", weightKg: 85.2 });
    expect(() => body.listBody(me, "2024-01-01", "2026-11-05")).toThrow(/731/);

    body.saveBodyEntry(me, { date: "2026-10-20", weightKg: null, waistCm: null });
    expect(body.getBodyEntry(me, "2026-10-20")).toBeNull();
    expect(body.deleteBodyEntry(me, "2026-11-05")).toBe(true);
    expect(body.deleteBodyEntry(me, "2026-11-05")).toBe(false);
  });
});
