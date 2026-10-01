import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { countUsers } from "@/lib/auth";
import { login } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (countUsers() === 0) redirect("/signup");
  const { next } = await searchParams;
  return (
    <>
      <p className="mb-5 text-stone-700">Connecte-toi pour accéder aux recettes du foyer.</p>
      <AuthForm
        action={login}
        submitLabel="Se connecter"
        pendingLabel="Connexion…"
        fields={[
          { name: "next", type: "hidden", value: next ?? "/" },
          { name: "email", type: "email", placeholder: "E-mail", autoComplete: "email" },
          { name: "password", type: "password", placeholder: "Mot de passe", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-6 text-sm text-stone-500">
        Pas encore de compte ? Demande un lien d&apos;invitation à un membre du foyer.
      </p>
    </>
  );
}
