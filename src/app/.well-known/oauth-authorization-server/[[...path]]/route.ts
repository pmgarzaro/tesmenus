import { CORS_HEADERS, preflight } from "@/lib/mcp/http";
import { authServerMetadata, publicOrigin } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return Response.json(authServerMetadata(publicOrigin(request)), { headers: CORS_HEADERS });
}

export const OPTIONS = preflight;
