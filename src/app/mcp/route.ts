// Remote MCP endpoint (Streamable HTTP, stateless) for claude.ai custom connectors.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CORS_HEADERS, preflight, withCors } from "@/lib/mcp/http";
import { publicOrigin, verifyAccessToken } from "@/lib/mcp/oauth";
import { createMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

function unauthorized(request: Request): Response {
  const metadata = `${publicOrigin(request)}/.well-known/oauth-protected-resource/mcp`;
  return Response.json(
    { error: "invalid_token", error_description: "Authentification requise" },
    {
      status: 401,
      headers: { ...CORS_HEADERS, "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="mcp"` },
    },
  );
}

async function handle(request: Request): Promise<Response> {
  const owner = verifyAccessToken(request.headers.get("authorization"));
  if (!owner) return unauthorized(request);
  const server = createMcpServer(owner);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: each request stands alone
    enableJsonResponse: true,
    maxRequestBodySize: 256 * 1024,
  });
  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } finally {
    // JSON responses are complete once returned.
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
