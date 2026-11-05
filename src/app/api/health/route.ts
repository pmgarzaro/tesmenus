import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { SERVER_INFO, toolNames } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

// Also tells which build is deployed (commit, MCP version and tools), to check
// that a merge reached production.
export function GET() {
  getDb().run(sql`select 1`);
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null;
  return Response.json({
    ok: true,
    commit: commit?.slice(0, 7) ?? null,
    mcp: { version: SERVER_INFO.version, tools: toolNames() },
  });
}
