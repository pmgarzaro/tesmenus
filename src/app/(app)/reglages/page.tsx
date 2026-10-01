import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { HouseholdNameForm, InviteButtons, PasswordForm } from "./AccountSection";
import { loadSampleRecipes } from "./actions";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const members = getDb()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.householdId, user.householdId))
    .orderBy(asc(schema.users.createdAt))
    .all();
  const household = getDb()
    .select()
    .from(schema.households)
    .where(eq(schema.households.id, user.householdId))
    .get()!;

  return (
    <>
      <PageHeader title="Réglages" />
      <SettingsForm settings={getSettings(user.householdId)} />

      <section className="mt-6 space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Mon foyer</h2>
        <HouseholdNameForm name={household.name} />
        <p className="text-sm text-stone-500">Membres (données partagées entre eux) :</p>
        <ul className="space-y-1 text-sm">
          {members.map((m) => (
            <li key={m.id}>
              <span className="font-medium">{m.name}</span>{" "}
              <span className="text-stone-500">{m.email}</span>
              {m.id === user.id && <span className="text-stone-400"> (toi)</span>}
            </li>
          ))}
        </ul>
        <InviteButtons />
      </section>

      <section className="mt-6 space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Mon compte</h2>
        <PasswordForm />
        <form action="/api/logout" method="post">
          <button className="text-stone-500 underline">Se déconnecter</button>
        </form>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Données</h2>
        <a href="/api/export" className="block text-brand-600 underline">
          Exporter toute la base (JSON)
        </a>
        <form action={loadSampleRecipes}>
          <button className="text-brand-600 underline">
            Charger les recettes d&apos;exemple (si la bibliothèque est vide)
          </button>
        </form>
      </section>
    </>
  );
}
