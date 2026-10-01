"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthState } from "@/components/AuthForm";
import { getDb, schema } from "@/db";
import { canSignUp, consumeInvite, startSession } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "@/lib/password";

function safeNext(form: FormData): string {
  const next = String(form.get("next") ?? "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

// Typed values sent back on error so the form is not emptied (never passwords).
function fail(error: string, form: FormData, keys: string[]): AuthState {
  return { error, values: Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? "")])) };
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = getDb().select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail("E-mail ou mot de passe incorrect", form, ["email"]);
  }
  await startSession(user.id);
  redirect(safeNext(form));
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Indique ton prénom").max(60),
  email: z.email("E-mail invalide").trim().toLowerCase(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères`),
  invite: z.string().optional(),
});

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
    invite: form.get("invite") || undefined,
  });
  const keep = ["name", "email"];
  if (!parsed.success) return fail(parsed.error.issues[0].message, form, keep);
  const { name, email, password, invite } = parsed.data;

  const passwordHash = await hashPassword(password);
  const db = getDb();
  const result = db.transaction((tx) => {
    if (!canSignUp(invite)) return "Ce lien d'invitation n'est plus valide";
    if (tx.select().from(schema.users).where(eq(schema.users.email, email)).get()) {
      return "Un compte existe déjà avec cet e-mail";
    }
    const { id } = tx
      .insert(schema.users)
      .values({ name, email, passwordHash })
      .returning({ id: schema.users.id })
      .get();
    if (invite) consumeInvite(invite);
    return id;
  });
  if (typeof result === "string") return fail(result, form, keep);

  await startSession(result);
  redirect("/");
}
