"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { approve, errorRedirect, validateAuthorize } from "@/lib/mcp/oauth";

const PARAMS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

export async function decide(form: FormData) {
  const params = Object.fromEntries(PARAMS.map((k) => [k, (form.get(k) as string | null) || undefined]));
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const check = validateAuthorize(params);
  if (!check.ok) redirect(check.redirectTo ?? "/");
  if (form.get("decision") !== "allow") {
    redirect(errorRedirect(check.value.redirectUri, check.value.state, "access_denied", "Refusé par l'utilisateur"));
  }
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const issuer = process.env.PUBLIC_URL?.replace(/\/+$/, "") || `${proto}://${h.get("x-forwarded-host") || h.get("host")}`;
  redirect(approve(user.id, check.value, issuer));
}
