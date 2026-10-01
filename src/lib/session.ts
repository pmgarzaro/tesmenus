// Signed-cookie session: "<userId>.<expiresAt>.<hmac>". Uses Web Crypto for
// signing; the secret comes from SESSION_SECRET or is generated once and kept
// in the data directory so sessions survive restarts.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";

export const SESSION_COOKIE = "tm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

const encoder = new TextEncoder();
let cachedSecret: string | undefined;

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const file = path.join(DATA_DIR, "session-secret");
  try {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const generated = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    try {
      fs.writeFileSync(file, generated, { flag: "wx", mode: 0o600 });
      cachedSecret = generated;
    } catch {
      // Another process created it first.
      cachedSecret = fs.readFileSync(file, "utf8").trim();
    }
  }
  return cachedSecret;
}

async function hmac(value: string, key: string): Promise<string> {
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

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  userId: number,
  now = Date.now(),
  key = secret(),
): Promise<string> {
  const payload = `${userId}.${now + SESSION_MAX_AGE * 1000}`;
  return `${payload}.${await hmac(payload, key)}`;
}

/** Returns the user id carried by a valid, unexpired token, else null. */
export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
  key = secret(),
): Promise<number | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  if (!safeEqual(sig, await hmac(`${userId}.${expires}`, key))) return null;
  const id = Number(userId);
  const exp = Number(expires);
  if (!Number.isInteger(id) || !Number.isFinite(exp) || exp <= now) return null;
  return id;
}
