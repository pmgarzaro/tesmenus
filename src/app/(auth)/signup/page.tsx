import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { getSignupTarget } from "@/lib/auth";
import { signup } from "../actions";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const target = getSignupTarget(invite);

  if (!target) {
    return (
      <>
        <p className="mb-5 text-stone-700">
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
      <p className="mb-5 text-stone-700">
        {target.kind === "first" &&
          "Bienvenue ! Crée le premier compte. Tu pourras ensuite inviter d'autres personnes."}
        {target.kind === "join" && (
          <>
            Tu as été invité·e à rejoindre <strong>{target.householdName}</strong>. Vous partagerez
            les recettes, plannings et listes de courses.
          </>
        )}
        {target.kind === "new" &&
          "Tu as été invité·e à utiliser l'appli. Crée ton compte : tu auras ton propre espace, séparé des autres foyers."}
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
      {target.kind !== "first" && (
        <p className="mt-6 text-sm text-stone-500">
          Déjà un compte ? <Link href="/login" className="text-brand-600 underline">Se connecter</Link>
        </p>
      )}
    </>
  );
}
