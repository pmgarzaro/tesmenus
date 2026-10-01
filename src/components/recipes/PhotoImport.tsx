"use client";

import { Camera, ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PhotoImport as PhotoResult } from "@/lib/import/photo";
import { ImportReview } from "./ImportReview";

type Page = { id: number; file: File; preview: string };
type Status =
  | { step: "idle" }
  | { step: "upload" }
  | { step: "ocr"; done: number; total: number; ai?: boolean }
  | { step: "error"; message: string };

let nextId = 1;
const MAX_PAGES = 6;

/** Downscales in the browser (upright, ≤ 2000 px JPEG): a 6 MB photo becomes ~500 KB. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file; // format the browser cannot draw: let the server try
  }
}

async function readStream(res: Response, onProgress: (done: number, total: number, ai?: boolean) => void): Promise<PhotoResult> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const msg = JSON.parse(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (msg.type === "progress") onProgress(msg.done, msg.total, msg.ai);
      if (msg.type === "error") throw new Error(msg.error);
      if (msg.type === "result") return msg as PhotoResult;
    }
  }
  throw new Error("Réponse interrompue.");
}

export function PhotoImport({ allTags }: { allTags: string[] }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [status, setStatus] = useState<Status>({ step: "idle" });
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const busy = status.step === "upload" || status.step === "ocr";

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const add = (files: FileList | null) => {
    if (!files) return;
    const added = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    setPages((p) =>
      [...p, ...added.map((file) => ({ id: nextId++, file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PAGES),
    );
    setStatus({ step: "idle" });
  };

  const remove = (id: number) =>
    setPages((p) => {
      const page = p.find((x) => x.id === id);
      if (page) URL.revokeObjectURL(page.preview);
      return p.filter((x) => x.id !== id);
    });

  const move = (i: number, d: number) =>
    setPages((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  async function read() {
    setElapsed(0);
    setStatus({ step: "upload" });
    try {
      const form = new FormData();
      for (const [i, page] of pages.entries()) form.append("photos", await shrink(page.file), `page-${i + 1}.jpg`);
      const res = await fetch("/api/import/photo", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Erreur ${res.status}`);
      }
      let ai = false;
      setResult(
        await readStream(res, (done, total, isAi) => {
          ai ||= Boolean(isAi);
          setStatus({ step: "ocr", done, total, ai });
        }),
      );
      setStatus({ step: "idle" });
    } catch (e) {
      setStatus({ step: "error", message: e instanceof Error ? e.message : "Envoi impossible." });
    }
  }

  if (result) {
    return (
      <ImportReview
        result={result.result}
        allTags={allTags}
        sourceType="photo"
        imagePaths={result.imagePaths}
        ocrText={result.ocrText}
        onRestart={() => setResult(null)}
      />
    );
  }

  const progress =
    status.step === "ocr" ? Math.round(((status.done + 0.5) / status.total) * 100) : status.step === "upload" ? 5 : 0;

  return (
    <div className="space-y-4 paper p-4">
      <p className="text-sm text-stone-600">
        Photographie la recette bien à plat, avec une bonne lumière et sans reflet. Une photo par page, dans
        l&apos;ordre.
      </p>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={galleryInput} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {pages.length > 0 && (
        <ol className="grid grid-cols-3 gap-2">
          {pages.map((p, i) => (
            <li key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full rounded-lg border border-stone-200 object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">{i + 1}</span>
              <div className="absolute inset-x-1 bottom-1 flex justify-between">
                <span className="flex gap-1">
                  <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Avant" className="rounded bg-white/90 p-1 disabled:opacity-30"><ChevronLeft className="size-4" aria-hidden /></button>
                  <button type="button" disabled={busy || i === pages.length - 1} onClick={() => move(i, 1)} aria-label="Après" className="rounded bg-white/90 p-1 disabled:opacity-30"><ChevronRight className="size-4" aria-hidden /></button>
                </span>
                <button type="button" disabled={busy} onClick={() => remove(p.id)} aria-label={`Retirer la page ${i + 1}`} className="rounded bg-white/90 p-1"><X className="size-4" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {pages.length < MAX_PAGES && !busy && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraInput.current?.click()} className="rounded-xl border border-stone-300 py-3 font-medium">
            <Camera className="mr-1.5 inline size-5 align-[-4px]" aria-hidden />
            {pages.length ? "Page suivante" : "Prendre une photo"}
          </button>
          <button type="button" onClick={() => galleryInput.current?.click()} className="rounded-xl border border-stone-300 py-3 font-medium">
            <Images className="mr-1.5 inline size-5 align-[-4px]" aria-hidden />
            Galerie
          </button>
        </div>
      )}

      {status.step === "error" && (
        <div className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Extraction échouée : {status.message}</p>
          <p>
            Tu peux réessayer ou <Link href="/recettes/nouvelle" className="underline">saisir la recette à la main</Link>.
          </p>
        </div>
      )}

      {busy && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-stone-600">
            {status.step === "upload"
              ? "Envoi des photos…"
              : status.ai
                ? "Lecture par l'IA (environ 10 à 30 s)…"
                : `Lecture de la page ${Math.min(status.done + 1, status.total)} sur ${status.total}…`}{" "}
            {elapsed > 0 && <span className="text-stone-400">{elapsed} s</span>}
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={pages.length === 0 || busy}
        onClick={read}
        className="w-full btn-primary py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Lecture en cours…" : `Lire la recette${pages.length > 1 ? ` (${pages.length} pages)` : ""}`}
      </button>
    </div>
  );
}
