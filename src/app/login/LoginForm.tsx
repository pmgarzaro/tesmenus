"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input
        type="password"
        name="password"
        autoFocus
        required
        placeholder="Mot de passe"
        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg outline-none focus:border-brand-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-3 text-lg font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Entrer"}
      </button>
    </form>
  );
}
