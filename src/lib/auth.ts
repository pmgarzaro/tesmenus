import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "./session";

export const INVITE_VALIDITY_DAYS = 7;

export type CurrentUser = { id: number; name: string; email: string; householdId: number };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const userId = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (userId === null) return null;
  const user = getDb()
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      householdId: schema.users.householdId,
    })
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

/**
 * Creates a one-time invite. With `householdId` the newcomer joins that
 * household; without it they start a new, separate one.
 */
export function createInvite(createdBy: number, householdId: number | null): string {
  const token = randomBytes(18).toString("base64url");
  getDb().insert(schema.invites).values({ token, createdBy, householdId }).run();
  return token;
}

const inviteIsValid = (token: string) =>
  and(
    eq(schema.invites.token, token),
    isNull(schema.invites.usedAt),
    gt(schema.invites.createdAt, sql`datetime('now', ${`-${INVITE_VALIDITY_DAYS} days`})`),
  );

export type SignupTarget =
  | { kind: "first" } // very first account
  | { kind: "join"; householdId: number; householdName: string }
  | { kind: "new" };

/**
 * What signing up does right now: open for the very first account, then only
 * with a valid invite. Returns null when sign-up is not allowed.
 */
export function getSignupTarget(inviteToken: string | undefined): SignupTarget | null {
  if (countUsers() === 0) return { kind: "first" };
  if (!inviteToken) return null;
  const invite = getDb()
    .select({ householdId: schema.invites.householdId, householdName: schema.households.name })
    .from(schema.invites)
    .leftJoin(schema.households, eq(schema.households.id, schema.invites.householdId))
    .where(inviteIsValid(inviteToken))
    .get();
  if (!invite) return null;
  if (invite.householdId === null) return { kind: "new" };
  return { kind: "join", householdId: invite.householdId, householdName: invite.householdName ?? "" };
}

export function consumeInvite(token: string) {
  getDb()
    .update(schema.invites)
    .set({ usedAt: sql`datetime('now')` })
    .where(inviteIsValid(token))
    .run();
}

/**
 * Household for the very first account: reuses data created before accounts
 * existed (household 1 from the migration) if there is one.
 */
export function firstHousehold(name: string): number {
  const db = getDb();
  const orphan = db
    .select({ id: schema.households.id })
    .from(schema.households)
    .orderBy(asc(schema.households.id))
    .get();
  if (orphan) return orphan.id;
  return createHousehold(name);
}

export function createHousehold(name: string): number {
  return getDb()
    .insert(schema.households)
    .values({ name })
    .returning({ id: schema.households.id })
    .get().id;
}
