import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-ocr-"));
const { ocrImage } = await import("./index");
const { importFromPhotos } = await import("@/lib/import/photo");
const { resolveUpload, deleteUploads } = await import("@/lib/uploads");

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", name));


describe("OCR", { timeout: 60_000 }, () => {
  it("reads a printed recipe", async () => {
    const r = await ocrImage(fixture("printed.jpg"));
    expect(r.confidence).toBeGreaterThan(80);
    expect(r.text).toContain("Hachis parmentier");
    expect(r.text).toContain("500 g de bœuf haché");
    expect(r.rotation).toBe(0);
  });

  it("reads a photo taken sideways", async () => {
    const sideways = await sharp(fixture("printed.jpg")).rotate(90).jpeg().toBuffer();
    const r = await ocrImage(sideways);
    expect(r.rotation).toBe(270);
    expect(r.text).toContain("pommes de terre");
  });
});

describe("photo import", { timeout: 60_000 }, () => {
  it("turns photos into a draft and keeps them", async () => {
    const progress: number[] = [];
    const { result, imagePaths, ocrText } = await importFromPhotos(1, [fixture("skewed.jpg")], (d) => progress.push(d));
    expect(progress).toEqual([1]);
    expect(ocrText).toContain("Ingrédients");
    expect(result.method).toBe("photo");
    expect(result.draft).toMatchObject({ title: "Hachis parmentier", servings: 4, prepMinutes: 30, cookMinutes: 40 });
    expect(result.draft.ingredients.map((i) => i.label)).toEqual([
      "pommes de terre", "bœuf haché", "oignons", "lait", "beurre", "gruyère râpé",
    ]);
    expect(result.draft.ingredients[0]).toMatchObject({ quantity: 1, unit: "kg" });
    expect(result.draft.steps).toHaveLength(4);
    expect(result.draft.steps[3]).toMatchObject({ equipment: "four", type: "cuisson" });
    expect(result.draft.tags).toContain("viande");
    expect(result.warnings.join()).not.toMatch(/difficile/);

    expect(imagePaths).toHaveLength(1);
    const abs = resolveUpload(1, imagePaths[0])!;
    expect(abs).toBeTruthy();
    const meta = await sharp(abs).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);
    expect(resolveUpload(2, imagePaths[0])).toBeNull(); // other household
    expect(resolveUpload(1, "../../etc/passwd")).toBeNull();
    deleteUploads(1, imagePaths);
    expect(resolveUpload(1, imagePaths[0])).toBeNull();
  });

  it("warns when the photo is unreadable", async () => {
    const noise = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 110, b: 100 } },
    }).jpeg().toBuffer();
    const { result } = await importFromPhotos(1, [noise]);
    expect(result.warnings[0]).toMatch(/difficile à lire/);
  });
});
