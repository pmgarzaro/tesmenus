import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export function GET() {
  getDb().run(sql`select 1`);
  return Response.json({ ok: true });
}
