// Local OCR (Tesseract, French model bundled in node_modules): no paid API.
// Works well on printed recipes; handwriting is read poorly.
import path from "node:path";
import sharp from "sharp";
import { type Worker, createWorker } from "tesseract.js";

export type OcrLine = { text: string; confidence: number };
export type OcrResult = { text: string; confidence: number; lines: OcrLine[]; rotation: number };

const LANG_PATH =
  process.env.OCR_LANG_PATH ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules/@tesseract.js-data/fra/4.0.0_best_int");

const PAGE_TIMEOUT_MS = 90_000;

// One worker, reused; calls are serialised.
let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function worker(): Promise<Worker> {
  workerPromise ??= createWorker("fra", 1, {
    langPath: LANG_PATH,
    gzip: true,
    cacheMethod: "none",
    errorHandler: (e: unknown) => console.error("OCR worker", e),
  }).catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

/** Drops a broken or stuck worker; the next call starts a fresh one. */
async function resetWorker() {
  const w = workerPromise;
  workerPromise = null;
  await w?.then((x) => x.terminate()).catch(() => undefined);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("OCR timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Upright (EXIF), at most 2000 px, grayscale, contrast stretched. */
export async function prepareForOcr(image: Buffer, rotate = 0): Promise<Buffer> {
  let img = sharp(image, { failOn: "none" }).rotate();
  if (rotate) img = sharp(await img.toBuffer()).rotate(rotate);
  return img
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();
}

async function recognize(image: Buffer, rotation: number): Promise<OcrResult> {
  const w = await worker();
  const { data } = await w.recognize(await prepareForOcr(image, rotation), {}, { text: true, blocks: true });
  const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence }))),
  );
  return { text: data.text, confidence: data.confidence, lines: lines.filter((l) => l.text), rotation };
}

const letters = (r: OcrResult) => (r.text.match(/\p{L}{3,}/gu) ?? []).length;

/**
 * Reads the text of a photo. If the result looks like noise (photo taken
 * sideways or upside down), tries the other orientations and keeps the best.
 */
export function ocrImage(image: Buffer): Promise<OcrResult> {
  const run = async () => {
    let best = await recognize(image, 0);
    if (best.confidence >= 60 && letters(best) >= 10) return best;
    for (const rotation of [90, 270, 180]) {
      const r = await recognize(image, rotation);
      if (r.confidence * Math.min(letters(r), 50) > best.confidence * Math.min(letters(best), 50)) best = r;
      if (best.confidence >= 70 && letters(best) >= 10) break;
    }
    return best;
  };
  const guarded = () =>
    withTimeout(run(), PAGE_TIMEOUT_MS).catch(async (e) => {
      await resetWorker();
      throw e;
    });
  const result = queue.then(guarded, guarded);
  queue = result.catch(() => undefined);
  return result;
}
