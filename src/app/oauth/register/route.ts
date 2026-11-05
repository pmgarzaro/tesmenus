// Dynamic client registration (RFC 7591).
import { CORS_HEADERS, clientIp, preflight } from "@/lib/mcp/http";
import { NO_STORE, OAuthError, oauthErrorResponse, registerClient } from "@/lib/mcp/oauth";
import { hit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (hit(`oauth-register:${clientIp(request)}`, 20, 60 * 60_000)) {
      throw new OAuthError("too_many_requests", "Trop d'enregistrements, réessaie plus tard", 429);
    }
    const body = await request.json().catch(() => {
      throw new OAuthError("invalid_client_metadata", "Corps JSON attendu");
    });
    return Response.json(registerClient(body), { status: 201, headers: { ...CORS_HEADERS, ...NO_STORE } });
  } catch (err) {
    const res = oauthErrorResponse(err);
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }
}

export const OPTIONS = preflight;
