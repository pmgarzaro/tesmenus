import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { canSignUp, countUsers } from "@/lib/auth";
import { signup } from "../actions";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const first = countUsers() === 0;

  if (!canSignUp(invite)) {
    return (
      <>
        <p className="mb-6 text-stone-600">
          {invite
            ? "Ce lien d'invitation a expiré ou a déjà été utilisé. Demande-en un nouveau."
            : "L'inscription se fait sur invitation : demande un lien à un membre du foyer (Réglages → Inviter quelqu'un)."}
        </p>
        <Link href="/login" className="text-brand-600 underline">Se connecter</Link>
      </>
    );
  }

  return (
    <>
      <p className="mb-8 text-stone-500">
        {first
          ? "Bienvenue ! Crée le premier compte du foyer. Tu pourras ensuite inviter d'autres personnes."
          : "Tu as été invité·e à rejoindre le foyer. Crée ton compte."}
      </p>
      <AuthForm
        action={signup}
        submitLabel="Créer mon compte"
        pendingLabel="Création…"
        fields={[
          ...(invite ? [{ name: "invite", type: "hidden" as const, value: invite }] : []),
          { name: "name", placeholder: "Prénom", autoComplete: "given-name" },
          { name: "email", type: "email", placeholder: "E-mail", autoComplete: "email" },
          {
            name: "password",
            type: "password",
            placeholder: `Mot de passe (${MIN_PASSWORD_LENGTH} caractères min.)`,
            autoComplete: "new-password",
            minLength: MIN_PASSWORD_LENGTH,
          },
        ]}
      />
      {!first && (
        <p className="mt-6 text-sm text-stone-500">
          Déjà un compte ? <Link href="/login" className="text-brand-600 underline">Se connecter</Link>
        </p>
      )}
    </>
  );
}
