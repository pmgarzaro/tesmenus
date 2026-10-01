// Minimal signed-cookie session: the cookie holds an expiry timestamp signed
// with HMAC-SHA256. Uses Web Crypto so it works in the proxy and in routes.

export const SESSION_COOKIE = "tm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

const encoder = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.APP_PASSWORD;
  if (!s) throw new Error("APP_PASSWORD (ou SESSION_SECRET) doit être défini");
  return s;
}

async function hmac(value: string, key = secret()): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(value));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(now = Date.now(), key?: string): Promise<string> {
  const payload = String(now + SESSION_MAX_AGE * 1000);
  return `${payload}.${await hmac(payload, key)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
  key?: string,
): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(sig, await hmac(payload, key))) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && expires > now;
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}
