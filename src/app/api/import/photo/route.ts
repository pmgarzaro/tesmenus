import { getCurrentUser } from "@/lib/auth";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, importFromPhotos } from "@/lib/import/photo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Multipart "photos" (pages in order) → NDJSON stream:
 * {"type":"progress","done":1,"total":2} … then {"type":"result",…} or {"type":"error",…}.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  let files: File[];
  try {
    files = (await request.formData()).getAll("photos").filter((f): f is File => f instanceof File);
  } catch {
    return Response.json({ error: "Envoi invalide." }, { status: 400 });
  }
  if (files.length === 0) return Response.json({ error: "Aucune photo reçue." }, { status: 400 });
  if (files.length > MAX_PHOTOS) return Response.json({ error: `${MAX_PHOTOS} photos maximum.` }, { status: 400 });
  if (files.some((f) => f.size > MAX_PHOTO_BYTES)) return Response.json({ error: "Photo trop lourde." }, { status: 400 });
  if (files.some((f) => f.type && !f.type.startsWith("image/"))) {
    return Response.json({ error: "Seules les images sont acceptées." }, { status: 400 });
  }
  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: object) => controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      send({ type: "progress", done: 0, total: buffers.length });
      try {
        const out = await importFromPhotos(user.householdId, buffers, (done, total) =>
          send({ type: "progress", done, total }),
        );
        send({ type: "result", ...out });
      } catch (e) {
        console.error("Import photo", e);
        send({ type: "error", error: "Lecture de la photo impossible (format non reconnu ?)." });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
