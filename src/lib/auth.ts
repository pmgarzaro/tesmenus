import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "./session";

export const INVITE_VALIDITY_DAYS = 7;

export type CurrentUser = { id: number; name: string; email: string };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const userId = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (userId === null) return null;
  const user = getDb()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return user ?? null;
}

/** For pages and server actions: the signed-in user, or a redirect to login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Secure cookie when served over HTTPS (e.g. behind Railway's proxy).
async function isHttps(): Promise<boolean> {
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === "true";
  return (await headers()).get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function startSession(userId: number) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export function countUsers(): number {
  return getDb().select({ n: sql<number>`count(*)` }).from(schema.users).get()!.n;
}

export function createInvite(createdBy: number): string {
  const token = randomBytes(18).toString("base64url");
  getDb().insert(schema.invites).values({ token, createdBy }).run();
  return token;
}

const inviteIsValid = (token: string) =>
  and(
    eq(schema.invites.token, token),
    isNull(schema.invites.usedAt),
    gt(schema.invites.createdAt, sql`datetime('now', ${`-${INVITE_VALIDITY_DAYS} days`})`),
  );

export function isInviteValid(token: string | undefined): boolean {
  if (!token) return false;
  return !!getDb().select().from(schema.invites).where(inviteIsValid(token)).get();
}

/** Sign-up is open for the very first account, then only with a valid invite. */
export function canSignUp(inviteToken: string | undefined): boolean {
  return countUsers() === 0 || isInviteValid(inviteToken);
}

export function consumeInvite(token: string) {
  getDb()
    .update(schema.invites)
    .set({ usedAt: sql`datetime('now')` })
    .where(inviteIsValid(token))
    .run();
}
