import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { validateAuthorize } from "@/lib/mcp/oauth";
import { decide } from "./actions";

export const dynamic = "force-dynamic";

/** Consent screen of the OAuth flow used by claude.ai custom connectors. */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;
  const user = await getCurrentUser();
  if (!user) {
    const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }
  const check = validateAuthorize(params);
  if (!check.ok) {
    if (check.redirectTo) redirect(check.redirectTo);
    return (
      <>
        <h1 className="mb-2 text-lg font-semibold">Connexion impossible</h1>
        <p className="text-stone-700">{check.message}</p>
      </>
    );
  }
  const host = new URL(check.value.redirectUri).host;
  const name = check.client.clientName || host;
  return (
    <form action={decide} className="space-y-4">
      <h1 className="text-lg font-semibold">Autoriser {name} ?</h1>
      <p className="text-stone-700">
        <strong>{name}</strong> ({host}) demande l&apos;accès à ton compte <strong>{user.email}</strong> :
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
        <li>lire le planning et les recettes du foyer ;</li>
        <li>lire et écrire ton journal alimentaire et tes objectifs nutritionnels.</li>
      </ul>
      <p className="text-sm text-stone-500">
        Il ne pourra pas modifier les recettes ni le planning. Tu peux retirer cet accès à tout moment dans Réglages.
      </p>
      {Object.entries(params).map(([k, v]) =>
        v !== undefined && k !== "decision" ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <div className="flex gap-3">
        <button name="decision" value="deny" className="flex-1 rounded-lg border border-stone-300 py-3 font-semibold">
          Refuser
        </button>
        <button name="decision" value="allow" className="flex-1 btn-primary py-3 font-semibold text-white">
          Autoriser
        </button>
      </div>
    </form>
  );
}
