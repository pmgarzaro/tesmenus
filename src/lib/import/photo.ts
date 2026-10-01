import { type OcrResult, ocrImage } from "@/lib/ocr";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cleanupOrphanPhotos, saveRecipePhoto } from "@/lib/uploads";
import { type ImportResult, buildDraft } from "./build";
import { parseRecipeText } from "./text";

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const DOUBTFUL_LINE = 75; // per-line OCR confidence below which a line is flagged
const HARD_TO_READ = 65; // overall confidence below which we warn

export type PhotoImport = { result: ImportResult; imagePaths: string[]; ocrText: string };

/**
 * Photos of one recipe (several pages, in order) → saved photos + draft.
 * `onProgress(done, total)` is called after each page.
 */
export async function importFromPhotos(
  householdId: number,
  photos: Buffer[],
  onProgress?: (done: number, total: number) => void,
): Promise<PhotoImport> {
  // Housekeeping: photos of imports never saved, older than a day.
  try {
    const used = getDb()
      .select({ paths: schema.recipes.imagePaths })
      .from(schema.recipes)
      .where(eq(schema.recipes.householdId, householdId))
      .all()
      .flatMap((r) => r.paths);
    cleanupOrphanPhotos(householdId, new Set(used));
  } catch (e) {
    console.error("Photo cleanup", e);
  }

  const imagePaths: string[] = [];
  const pages: OcrResult[] = [];
  for (const [i, photo] of photos.entries()) {
    imagePaths.push(await saveRecipePhoto(householdId, photo));
    pages.push(await ocrImage(photo));
    onProgress?.(i + 1, photos.length);
  }

  const ocrText = pages.map((p) => p.text.trim()).join("\n\n");
  const raw = parseRecipeText(ocrText);
  raw.doubtfulLines = pages.flatMap((p) => p.lines.filter((l) => l.confidence < DOUBTFUL_LINE).map((l) => l.text));
  const result = buildDraft(raw, "photo");

  const confidence = pages.reduce((sum, p) => sum + p.confidence, 0) / Math.max(pages.length, 1);
  if (confidence < HARD_TO_READ) {
    result.warnings.unshift(
      "Texte difficile à lire (écriture manuscrite, flou, reflets ?) : vérifie tout, ou complète à la main en t'aidant de la photo.",
    );
  }
  if (pages.some((p) => p.rotation)) result.warnings.push("Photo tournée automatiquement pour la lecture.");
  return { result, imagePaths, ocrText };
}
