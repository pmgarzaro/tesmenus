import fs from "node:fs";
import { getCurrentUser } from "@/lib/auth";
import { resolveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Recipe photos, only for members of the owning household. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const abs = resolveUpload(user.householdId, (await params).path.join("/"));
  if (!abs) return new Response("Introuvable", { status: 404 });
  return new Response(fs.readFileSync(abs), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
