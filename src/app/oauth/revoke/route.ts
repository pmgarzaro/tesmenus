// Token revocation (RFC 7009): always 200, even for unknown tokens.
import { CORS_HEADERS, preflight } from "@/lib/mcp/http";
import { authenticateClient, oauthErrorResponse, revokeToken } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = new URLSearchParams(await request.text());
    const client = authenticateClient(form, request.headers.get("authorization"));
    const token = form.get("token");
    if (token) revokeToken(client, token);
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    const res = oauthErrorResponse(err);
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }
}

export const OPTIONS = preflight;
