"use client";

import { useActionState, useState, useTransition } from "react";
import { changePassword, generateInvite, renameHousehold, setAiEnabled } from "./actions";

const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2";

const INVITE_TEXT = {
  join: "Ce lien permet de rejoindre ton foyer et de partager toutes ses données.",
  new: "Ce lien permet de créer un compte avec son propre espace, séparé du tien.",
};

export function InviteButtons() {
  const [invite, setInvite] = useState<{ kind: "join" | "new"; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const create = (kind: "join" | "new") =>
    start(async () => {
      setCopied(false);
      setInvite({ kind, link: window.location.origin + (await generateInvite(kind)) });
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() => create("join")}
          className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Inviter dans mon foyer
        </button>
        <button
          disabled={pending}
          onClick={() => create("new")}
          className="rounded-xl border border-brand-600 px-4 py-2 font-semibold text-brand-700 disabled:opacity-60"
        >
          Inviter un nouveau foyer
        </button>
      </div>
      {invite && (
        <div className="space-y-2 rounded-xl bg-brand-50 p-3 text-sm">
          <p>
            {INVITE_TEXT[invite.kind]} Valable 7 jours, utilisable une fois.
          </p>
          <input readOnly value={invite.link} onFocus={(e) => e.target.select()} className={input} />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(invite.link);
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

export function HouseholdNameForm({ name }: { name: string }) {
  const [message, action, pending] = useActionState(renameHousehold, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="name" defaultValue={name} required maxLength={60} className={`${input} flex-1`} />
      <button disabled={pending} className="rounded-xl border border-stone-300 px-4 py-2 disabled:opacity-60">
        Renommer
      </button>
      {message && <span className="w-full text-sm text-stone-600">{message}</span>}
    </form>
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

export function AiToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center justify-between gap-4">
      <span>Utiliser l&apos;IA pour ce foyer</span>
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(() => setAiEnabled(next));
        }}
        className="size-5 accent-brand-600"
      />
    </label>
  );
}
