import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { expiryText, stockStatus } from "./stock";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-stock-"));
const { getDb, schema } = await import("@/db");
const stock = await import("./repo");

let mine: number;
let theirs: number;
const TODAY = "2026-11-09";

beforeAll(() => {
  const db = getDb();
  [mine, theirs] = ["A", "B"].map((name) => db.insert(schema.households).values({ name }).returning().get().id);
});

describe("expiry status", () => {
  it("classifies by days left", () => {
    expect(stockStatus("2026-11-08", TODAY)).toBe("perime");
    expect(stockStatus("2026-11-09", TODAY)).toBe("bientot");
    expect(stockStatus("2026-11-11", TODAY)).toBe("bientot");
    expect(stockStatus("2026-11-12", TODAY)).toBe("ok");
    expect(stockStatus(null, TODAY)).toBe("sans-date");
  });

  it("describes the date", () => {
    expect(expiryText(-3)).toBe("périmé depuis 3 jours");
    expect(expiryText(-1)).toBe("périmé depuis hier");
    expect(expiryText(0)).toBe("aujourd'hui");
    expect(expiryText(1)).toBe("demain");
    expect(expiryText(6)).toBe("dans 6 jours");
    expect(expiryText(204)).toBe("dans 7 mois");
    expect(expiryText(null)).toBe("sans date");
  });
});

describe("stock repository", () => {
  it("adds items, sorted by date with undated items last, per household", () => {
    stock.addStockItem(mine, { name: "Pâtes", location: "placard" }, TODAY);
    stock.addStockItem(mine, { name: "Yaourts", quantity: "4", expiresOn: "2026-11-07" }, TODAY);
    stock.addStockItem(mine, { name: "Crème fraîche", quantity: " 20 cl ", expiresOn: "2026-11-10" }, TODAY);
    stock.addStockItem(theirs, { name: "Lait", expiresOn: "2026-11-01" }, TODAY);

    const items = stock.listStock(mine, TODAY);
    expect(items.map((i) => [i.name, i.status, i.daysLeft])).toEqual([
      ["Yaourts", "perime", -2],
      ["Crème fraîche", "bientot", 1],
      ["Pâtes", "sans-date", null],
    ]);
    expect(items[1]).toMatchObject({ quantity: "20 cl", location: "frigo", note: null });
  });

  it("validates input", () => {
    expect(() => stock.addStockItem(mine, { name: "  " })).toThrow(/Indique/);
    expect(() => stock.addStockItem(mine, { name: "Beurre", expiresOn: "2026-02-30" })).toThrow(/Date invalide/);
    expect(() => stock.addStockItem(mine, { name: "Beurre", location: "cave" as never })).toThrow(/Emplacement/);
  });

  it("updates only the given fields, and only in its household", () => {
    const [yaourts] = stock.listStock(mine, TODAY);
    const updated = stock.updateStockItem(mine, yaourts.id, { expiresOn: "2026-11-20", quantity: null }, TODAY);
    expect(updated).toMatchObject({ name: "Yaourts", quantity: null, expiresOn: "2026-11-20", status: "ok" });
    expect(() => stock.updateStockItem(theirs, yaourts.id, { name: "x" })).toThrow(/introuvable/);
  });

  it("removes items of its own household only", () => {
    const ids = stock.listStock(mine, TODAY).map((i) => i.id);
    const other = stock.listStock(theirs, TODAY)[0].id;
    expect(stock.removeStockItems(mine, [ids[0], other])).toBe(1);
    expect(stock.listStock(theirs, TODAY)).toHaveLength(1);
    expect(stock.listStock(mine, TODAY)).toHaveLength(2);
    expect(stock.removeStockItems(mine, [])).toBe(0);
  });
});
