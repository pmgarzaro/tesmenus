"use client";

import { useActionState, useState, useTransition } from "react";
import { changePassword, generateInvite } from "./actions";

const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2";

export function InviteButton() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setCopied(false);
            setLink(window.location.origin + (await generateInvite()));
          })
        }
        className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        Inviter quelqu&apos;un
      </button>
      {link && (
        <div className="space-y-2 rounded-xl bg-brand-50 p-3 text-sm">
          <p>Envoie ce lien (valable 7 jours, utilisable une fois) :</p>
          <input readOnly value={link} onFocus={(e) => e.target.select()} className={input} />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
            className="text-brand-700 underline"
          >
            {copied ? "Copié ✓" : "Copier le lien"}
          </button>
        </div>
      )}
    </div>
  );
}

export function PasswordForm() {
  const [message, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="space-y-2">
      <input type="password" name="current" required autoComplete="current-password" placeholder="Mot de passe actuel" className={input} />
      <input type="password" name="next" required autoComplete="new-password" placeholder="Nouveau mot de passe" className={input} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-xl border border-stone-300 px-4 py-2 disabled:opacity-60">
          Changer le mot de passe
        </button>
        {message && <span className="text-sm text-stone-600">{message}</span>}
      </div>
    </form>
  );
}
