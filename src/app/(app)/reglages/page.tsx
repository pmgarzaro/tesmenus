import { PageHeader } from "@/components/PageHeader";
import { getSettings } from "@/lib/settings";
import { loadSampleRecipes } from "./actions";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Réglages" />
      <SettingsForm settings={getSettings()} />
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
        <form action="/api/logout" method="post">
          <button className="text-stone-500 underline">Se déconnecter</button>
        </form>
      </section>
    </>
  );
}
