// Recipe photos: data/uploads/h<householdId>/<uuid>.jpg (paths stored relative).
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR } from "./paths";

const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const PATH_RE = /^h(\d+)\/[0-9a-f-]{36}\.jpg$/;

/** Stores an upright JPEG, at most 1600 px. Returns its relative path. */
export async function saveRecipePhoto(householdId: number, image: Buffer): Promise<string> {
  const rel = `h${householdId}/${randomUUID()}.jpg`;
  const abs = path.join(UPLOADS_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await sharp(image, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(abs);
  return rel;
}

/** Absolute path of a household's upload, or null if invalid / foreign / missing. */
export function resolveUpload(householdId: number, rel: string): string | null {
  const m = rel.match(PATH_RE);
  if (!m || Number(m[1]) !== householdId) return null;
  const abs = path.join(UPLOADS_DIR, rel);
  return fs.existsSync(abs) ? abs : null;
}

export function deleteUploads(householdId: number, rels: string[]) {
  for (const rel of rels) {
    const abs = resolveUpload(householdId, rel);
    if (abs) fs.rmSync(abs, { force: true });
  }
}

/**
 * Deletes a household's photos older than `maxAgeMs` that no recipe uses
 * (photo imports abandoned before saving). Returns how many were removed.
 */
export function cleanupOrphanPhotos(householdId: number, used: Set<string>, maxAgeMs = 24 * 3600_000, now = Date.now()): number {
  const dir = path.join(UPLOADS_DIR, `h${householdId}`);
  let removed = 0;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  for (const f of files) {
    const rel = `h${householdId}/${f}`;
    if (!PATH_RE.test(rel) || used.has(rel)) continue;
    const abs = path.join(dir, f);
    if (now - fs.statSync(abs).mtimeMs > maxAgeMs) {
      fs.rmSync(abs, { force: true });
      removed++;
    }
  }
  return removed;
}
