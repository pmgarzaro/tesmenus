// Token endpoint: authorization_code (PKCE) and refresh_token grants.
import { CORS_HEADERS, clientIp, preflight } from "@/lib/mcp/http";
import {
  NO_STORE,
  OAuthError,
  authenticateClient,
  exchangeCode,
  oauthErrorResponse,
  refreshTokens,
} from "@/lib/mcp/oauth";
import { hit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (hit(`oauth-token:${clientIp(request)}`, 60, 15 * 60_000)) {
      throw new OAuthError("too_many_requests", "Trop de requêtes, réessaie plus tard", 429);
    }
    const form = new URLSearchParams(await request.text());
    const client = authenticateClient(form, request.headers.get("authorization"));
    const grant = form.get("grant_type");
    const tokens =
      grant === "authorization_code"
        ? exchangeCode(client, form)
        : grant === "refresh_token"
          ? refreshTokens(client, form)
          : (() => {
              throw new OAuthError("unsupported_grant_type", "grant_type non supporté");
            })();
    return Response.json(tokens, { headers: { ...CORS_HEADERS, ...NO_STORE } });
  } catch (err) {
    const res = oauthErrorResponse(err);
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }
}

export const OPTIONS = preflight;
