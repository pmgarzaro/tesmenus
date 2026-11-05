// Minimal OAuth 2.1 authorization server for the MCP endpoint, as used by
// claude.ai custom connectors: metadata discovery (RFC 8414 / RFC 9728),
// dynamic client registration (RFC 7591), authorization code + PKCE S256,
// refresh token rotation. The user signs in with their usual app account and
// approves the client; tokens are bound to that user (and their household).
// Only SHA-256 hashes of secrets, codes and tokens are stored.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { safeEqual } from "@/lib/session";
import type { Owner } from "@/lib/journal/repo";

export const SCOPE = "mcp";
export const ACCESS_TOKEN_TTL_S = 60 * 60; // 1 h
export const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 90; // 90 days
const CODE_TTL_MS = 5 * 60_000;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");
const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function oauthErrorResponse(err: unknown): Response {
  if (err instanceof OAuthError) {
    return Response.json({ error: err.code, error_description: err.message }, { status: err.status, headers: NO_STORE });
  }
  console.error("[oauth] error", err instanceof Error ? err.message : err);
  return Response.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
}

export const NO_STORE = { "Cache-Control": "no-store" };

// ---------------------------------------------------------------------------
// URLs

/** Public origin of the app: PUBLIC_URL, else the (proxied) request host. */
export function publicOrigin(request: Request): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Tes menus",
  };
}

// ---------------------------------------------------------------------------
// Clients (dynamic registration)

const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;

/** https anywhere, http only for loopback (local tools such as MCP Inspector). */
export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}

export function registerClient(body: unknown) {
  const meta = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const redirectUris = meta.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris est obligatoire (1 à 10 adresses)");
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string" || uri.length > 500 || !isAllowedRedirectUri(uri)) {
      throw new OAuthError("invalid_redirect_uri", "Adresse de redirection refusée (https requis)");
    }
  }
  const method = (meta.token_endpoint_auth_method ?? "none") as string;
  if (!(AUTH_METHODS as readonly string[]).includes(method)) {
    throw new OAuthError("invalid_client_metadata", "token_endpoint_auth_method non supportée");
  }
  const grants = (meta.grant_types ?? ["authorization_code"]) as unknown;
  if (!Array.isArray(grants) || !grants.includes("authorization_code")) {
    throw new OAuthError("invalid_client_metadata", "grant_types doit inclure authorization_code");
  }
  const clientName = typeof meta.client_name === "string" ? meta.client_name.slice(0, 100) : null;
  const clientId = randomToken(16);
  const clientSecret = method === "none" ? null : randomToken();
  getDb()
    .insert(schema.oauthClients)
    .values({
      clientId,
      clientSecretHash: clientSecret ? sha256(clientSecret) : null,
      clientName,
      redirectUris: redirectUris as string[],
      tokenEndpointAuthMethod: method,
    })
    .run();
  return {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName ?? undefined,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: method,
    scope: SCOPE,
  };
}

export function getClient(clientId: string) {
  return getDb().select().from(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId)).get() ?? null;
}

export type Client = NonNullable<ReturnType<typeof getClient>>;

/** Client credentials from the body or a Basic header, checked against the registration. */
export function authenticateClient(form: URLSearchParams, authorization: string | null): Client {
  let clientId = form.get("client_id");
  let secret = form.get("client_secret");
  if (authorization?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i > 0) {
      clientId = decodeURIComponent(decoded.slice(0, i));
      secret = decodeURIComponent(decoded.slice(i + 1));
    }
  }
  const client = clientId ? getClient(clientId) : null;
  if (!client) throw new OAuthError("invalid_client", "Client inconnu", 401);
  if (client.clientSecretHash) {
    if (!secret || !safeEqual(sha256(secret), client.clientSecretHash)) {
      throw new OAuthError("invalid_client", "Secret client invalide", 401);
    }
  }
  return client;
}

// ---------------------------------------------------------------------------
// Authorization request (validated before showing the consent screen)

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
};

/**
 * Validates an authorization request. Errors that must not redirect (unknown
 * client, bad redirect_uri) throw; the others are reported to the client
 * through its redirect_uri by the caller.
 */
export function validateAuthorize(params: Record<string, string | undefined>):
  | { ok: true; value: AuthorizeParams; client: Client }
  | { ok: false; redirectTo: string | null; message: string } {
  const client = params.client_id ? getClient(params.client_id) : null;
  if (!client) return { ok: false, redirectTo: null, message: "Application inconnue (client_id invalide)." };
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, redirectTo: null, message: "Adresse de redirection non enregistrée pour cette application." };
  }
  const errorTo = (error: string, description: string) =>
    errorRedirect(redirectUri, params.state ?? null, error, description);
  if (params.response_type !== "code") {
    return { ok: false, redirectTo: errorTo("unsupported_response_type", "response_type=code requis"), message: "" };
  }
  if (!params.code_challenge || params.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge)) {
    return { ok: false, redirectTo: errorTo("invalid_request", "PKCE S256 requis"), message: "" };
  }
  if (params.scope && !params.scope.split(" ").every((s) => s === SCOPE)) {
    return { ok: false, redirectTo: errorTo("invalid_scope", `Seul le scope « ${SCOPE} » existe`), message: "" };
  }
  return {
    ok: true,
    client,
    value: {
      clientId: client.clientId,
      redirectUri,
      codeChallenge: params.code_challenge,
      state: params.state ?? null,
      scope: SCOPE,
      resource: params.resource ?? null,
    },
  };
}

export function errorRedirect(redirectUri: string, state: string | null, error: string, description?: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

/** Issues a one-time code after the user approved; returns the redirect URL. */
export function approve(userId: number, p: AuthorizeParams, issuer: string): string {
  const code = randomToken();
  const db = getDb();
  db.delete(schema.oauthCodes).where(lt(schema.oauthCodes.expiresAt, Date.now())).run();
  db.insert(schema.oauthCodes)
    .values({
      codeHash: sha256(code),
      clientId: p.clientId,
      userId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scope: p.scope,
      resource: p.resource,
      expiresAt: Date.now() + CODE_TTL_MS,
    })
    .run();
  const u = new URL(p.redirectUri);
  u.searchParams.set("code", code);
  if (p.state) u.searchParams.set("state", p.state);
  u.searchParams.set("iss", issuer);
  return u.toString();
}

// ---------------------------------------------------------------------------
// Tokens

function issueTokens(clientId: string, userId: number, scope: string | null) {
  const access = randomToken();
  const refresh = randomToken();
  const now = Date.now();
  getDb()
    .insert(schema.oauthTokens)
    .values([
      { tokenHash: sha256(access), kind: "access", clientId, userId, scope, expiresAt: now + ACCESS_TOKEN_TTL_S * 1000 },
      { tokenHash: sha256(refresh), kind: "refresh", clientId, userId, scope, expiresAt: now + REFRESH_TOKEN_TTL_S * 1000 },
    ])
    .run();
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refresh,
    scope: scope ?? SCOPE,
  };
}

export function exchangeCode(client: Client, form: URLSearchParams) {
  const code = form.get("code");
  const verifier = form.get("code_verifier");
  if (!code || !verifier) throw new OAuthError("invalid_request", "code et code_verifier sont obligatoires");
  const db = getDb();
  // Single use: deleted whatever the outcome.
  const row = db.delete(schema.oauthCodes).where(eq(schema.oauthCodes.codeHash, sha256(code))).returning().get();
  if (!row || row.clientId !== client.clientId || row.expiresAt < Date.now()) {
    throw new OAuthError("invalid_grant", "Code invalide ou expiré");
  }
  const redirectUri = form.get("redirect_uri");
  if (redirectUri && redirectUri !== row.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri différente");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(sha256(verifier), row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "code_verifier invalide");
  }
  return issueTokens(client.clientId, row.userId, row.scope);
}

export function refreshTokens(client: Client, form: URLSearchParams) {
  const token = form.get("refresh_token");
  if (!token) throw new OAuthError("invalid_request", "refresh_token est obligatoire");
  // Rotation: the old refresh token is consumed.
  const row = getDb()
    .delete(schema.oauthTokens)
    .where(and(eq(schema.oauthTokens.tokenHash, sha256(token)), eq(schema.oauthTokens.kind, "refresh")))
    .returning()
    .get();
  if (!row || row.clientId !== client.clientId || row.expiresAt < Date.now()) {
    throw new OAuthError("invalid_grant", "refresh_token invalide ou expiré");
  }
  return issueTokens(client.clientId, row.userId, row.scope);
}

export function revokeToken(client: Client, token: string) {
  getDb()
    .delete(schema.oauthTokens)
    .where(and(eq(schema.oauthTokens.tokenHash, sha256(token)), eq(schema.oauthTokens.clientId, client.clientId)))
    .run();
}

function ownerOfUser(userId: number): Owner | null {
  const user = getDb()
    .select({ userId: schema.users.id, householdId: schema.users.householdId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return user ?? null;
}

/**
 * Optional static token (MCP_TOKEN, at least 32 characters) for tools that
 * cannot do OAuth (curl, scripts). Acts as the account MCP_TOKEN_EMAIL.
 */
function staticTokenOwner(token: string): Owner | null {
  const expected = process.env.MCP_TOKEN;
  if (!expected || expected.length < 32 || !safeEqual(sha256(token), sha256(expected))) return null;
  const email = process.env.MCP_TOKEN_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const user = getDb().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get();
  return user ? ownerOfUser(user.id) : null;
}

/** The user an access token acts for, or null if missing/invalid/expired. */
export function verifyAccessToken(authorization: string | null): Owner | null {
  const m = authorization?.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i);
  if (!m) return null;
  const token = m[1];
  const row = getDb()
    .select()
    .from(schema.oauthTokens)
    .where(and(eq(schema.oauthTokens.tokenHash, sha256(token)), eq(schema.oauthTokens.kind, "access")))
    .get();
  if (row && row.expiresAt > Date.now()) return ownerOfUser(row.userId);
  return staticTokenOwner(token);
}

// ---------------------------------------------------------------------------
// Connections shown in the app's settings

/** Apps holding a valid token for this user. */
export function listConnections(userId: number) {
  const rows = getDb()
    .select({
      clientId: schema.oauthTokens.clientId,
      clientName: schema.oauthClients.clientName,
      redirectUris: schema.oauthClients.redirectUris,
      createdAt: schema.oauthTokens.createdAt,
      expiresAt: schema.oauthTokens.expiresAt,
    })
    .from(schema.oauthTokens)
    .innerJoin(schema.oauthClients, eq(schema.oauthClients.clientId, schema.oauthTokens.clientId))
    .where(and(eq(schema.oauthTokens.userId, userId), eq(schema.oauthTokens.kind, "refresh")))
    .all()
    .filter((r) => r.expiresAt > Date.now());
  const byClient = new Map<string, { clientId: string; name: string; lastAuthorized: string }>();
  for (const r of rows) {
    const host = (() => {
      try {
        return new URL(r.redirectUris[0]).host;
      } catch {
        return "";
      }
    })();
    const prev = byClient.get(r.clientId);
    if (!prev || r.createdAt > prev.lastAuthorized) {
      byClient.set(r.clientId, { clientId: r.clientId, name: r.clientName || host || "Application", lastAuthorized: r.createdAt });
    }
  }
  return [...byClient.values()].sort((a, b) => b.lastAuthorized.localeCompare(a.lastAuthorized));
}

/** Revokes every token this user gave to the client. */
export function revokeConnection(userId: number, clientId: string) {
  getDb()
    .delete(schema.oauthTokens)
    .where(and(eq(schema.oauthTokens.userId, userId), eq(schema.oauthTokens.clientId, clientId)))
    .run();
}
